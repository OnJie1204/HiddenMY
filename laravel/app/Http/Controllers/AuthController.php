<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Password;
use Illuminate\Auth\Events\PasswordReset;
use App\Notifications\VerifyNewEmail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    // register
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
        ]);

        event(new \Illuminate\Auth\Events\Registered($user)); // Trigger the sending of a verification email

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Registration successful. Please check your email to verify your account.',
        ], 201);
    }

    // login
    public function login(Request $request)
    {
        $start = microtime(true);

        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        // Device-level lockout: keyed by IP, independent of which account is being tried.
        $deviceKey = 'login-device:' . $request->ip();

        if (RateLimiter::tooManyAttempts($deviceKey, 5)) {
            $secondsLeft = RateLimiter::availableIn($deviceKey);
            return response()->json([
                'message' => "Too many login attempts from this device. Please try again in {$secondsLeft} second(s).",
            ], 429);
        }

        $user = User::where('email', $request->email)->first();
        Log::info('After first query: ' . (microtime(true) - $start) . 's');

        if (!$user) {
            RateLimiter::hit($deviceKey, 60); // demo: 1 minute (normally 900s / 15 min)
            throw ValidationException::withMessages([
                'email' => ['The provided account or password is incorrect.'],
            ]);
        }

        // Check if the account is locked.
        if ($user->locked_until && $user->locked_until->isFuture()) {
            $secondsLeft = now()->diffInSeconds($user->locked_until);
            return response()->json([
                'message' => "Too many failed attempts. Please try again in {$secondsLeft} second(s).",
            ], 423); // 423 Locked
        }

        if (!Hash::check($request->password, $user->password)) {
            RateLimiter::hit($deviceKey, 60); // demo: 1 minute (normally 900s / 15 min)
            $user->increment('failed_login_attempts');

            if ($user->failed_login_attempts >= 5) {
                $user->locked_until = now()->addSeconds(60); // demo: 1 minute (normally 15 min)
                $user->save();

                return response()->json([
                    'message' => 'Too many failed attempts. Your account has been locked for 1 minute.',
                ], 423);
            }

            $user->save();

            throw ValidationException::withMessages([
                'email' => ['The provided account or password is incorrect.'],
            ]);
        }

        if (!$user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Please verify your email before logging in.',
            ], 403);
        }

        // Login successful; reset failed attempt counts for both the account and this device.
        $user->failed_login_attempts = 0;
        $user->locked_until = null;
        $user->save();
        RateLimiter::clear($deviceKey);

        $token = $user->createToken('auth_token')->plainTextToken;
        Log::info('Total time: ' . (microtime(true) - $start) . 's');

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    // logout
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out']);
    }

    // retrieve information about the currently logged-in user.
    public function me(Request $request)
    {
        $user = $request->user();
        return response()->json([
            ...$user->toArray(),
            'has_password' => !is_null($user->password),
        ]);
    }

    // Send password reset email
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $status = Password::sendResetLink(
            $request->only('email')
        );

        if ($status === Password::RESET_LINK_SENT) {
            return response()->json(['message' => 'A password reset link has been sent to your email address.']);
        }

        return response()->json(['message' => 'Unable to send reset link'], 400);
    }

    // Perform password reset
    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required',
            'email' => 'required|email',
            'password' => 'required|min:8|confirmed',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function ($user, $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                ])->save();

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Password reset successful.']);
        }

        return response()->json(['message' => 'Reset failed; the connection may have expired.'], 400);
    }

    // Update Profile
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|email|unique:users,email,' . $user->id,
        ]);

        // If the name has changed, update it directly.
        if (isset($validated['name'])) {
            $user->name = $validated['name'];
        }

        // If the email address changes, do not update it directly; send a verification email first.
        if (isset($validated['email']) && $validated['email'] !== $user->email) {
            $token = Str::random(60);
            $user->pending_email = $validated['email'];
            $user->email_change_token = $token;
            $user->save();

            // Switch to using `Notification::route` to specify sending directly to the new email address.
            Notification::route('mail', $validated['email'])
                ->notify(new VerifyNewEmail($token));

            return response()->json([
                'message' => 'A verification email has been sent to your new email address. Please check your inbox to confirm the change.',
                'user' => $user,
            ]);
        }

        $user->save();

        return response()->json(['message' => 'Profile updated successfully', 'user' => $user]);
    }

    // Upload / replace the user's avatar photo
    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|max:5120',
        ]);

        $user = $request->user();
        $image = $request->file('avatar');
        $fileName = $user->id . '-' . uniqid() . '.' . $image->getClientOriginalExtension();

        $response = Http::withHeaders([
            'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
            'apikey' => env('SUPABASE_KEY'),
            'Content-Type' => $image->getMimeType(),
        ])->withBody(
            file_get_contents($image->getRealPath()),
            $image->getMimeType()
        )->post(
            env('SUPABASE_URL') . '/storage/v1/object/avatars/' . $fileName
        );

        if ($response->failed()) {
            return response()->json([
                'message' => 'Failed to upload avatar.',
                'error' => $response->json(),
            ], 500);
        }

        $user->avatar_url = env('SUPABASE_URL') . '/storage/v1/object/public/avatars/' . $fileName;
        $user->save();

        return response()->json([
            'message' => 'Avatar updated successfully',
            'user' => $user,
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = $request->user();

        if ($user->password) {
            // For standard users who already have a password, follow the existing logic.
            $request->validate([
                'current_password' => 'required',
                'new_password' => 'required|min:8|confirmed',
            ]);

            if (!Hash::check($request->current_password, $user->password)) {
                return response()->json(['message' => 'Current password is incorrect'], 400);
            }
        } else {
            // For Google users signing in and setting a password for the first time, verifying the "current password" is not required.
            $request->validate([
                'new_password' => 'required|min:8|confirmed',
            ]);
        }

        $user->update(['password' => Hash::make($request->new_password)]);

        return response()->json(['message' => 'Password updated successfully']);
    }

    public function verifyNewEmail(Request $request)
    {
        $request->validate(['token' => 'required']);

        $user = \App\Models\User::where('email_change_token', $request->token)->first();

        if (!$user || !$user->pending_email) {
            return response()->json(['message' => 'Invalid or expired verification link'], 400);
        }

        $user->email = $user->pending_email;
        $user->pending_email = null;
        $user->email_change_token = null;
        $user->save();

        return response()->json(['message' => 'Email successfully updated']);
    }

    public function resendVerification(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json(['message' => 'No account found with this email'], 404);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'This email is already verified. Please log in.'], 400);
        }

        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'Verification email has been resent. Please check your inbox.']);
    }
}