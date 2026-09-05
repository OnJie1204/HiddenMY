<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;

use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;
use Illuminate\Support\Str;

class GoogleAuthController extends Controller
{
    // Redirecting to the Google sign-in screen
    public function redirect(Request $request)
    {
        $remember = $request->query('remember', 'false');
    
        return Socialite::driver('google')
            ->stateless()
            ->with(['state' => $remember])
            ->redirect();
        }

    // Process the returned information after Google sign-in is complete.
    public function callback(Request $request)
    {
        $googleUser = Socialite::driver('google')->stateless()->user(); // @phpstan-ignore-line
        $remember = $request->query('state', 'false');

        // First, check if an account has already been created using the `google_id`.
        $user = User::where('google_id', $googleUser->getId())->first();

        if (!$user) {
            // Next, check whether this email has already been used to register with an email and password.
            $user = User::where('email', $googleUser->getEmail())->first();

            if ($user) {
                // Add the `google_id` to existing accounts so they can also be used to log in via Google in the future.
                $user->google_id = $googleUser->getId();
                $user->save();
            } else {
                // New user, create an account
                $user = User::create([
                    'name' => $googleUser->getName(),
                    'email' => $googleUser->getEmail(),
                    'google_id' => $googleUser->getId(),
                    'password' => null,
                    'email_verified_at' => now(), // Google 已验证过，直接标记为已验证
                    'avatar_url' => $googleUser->getAvatar(),
                ]);
            }
        }

        // Backfill the Google avatar for accounts that don't have one yet
        // (e.g. Google users created before avatar_url existed). Never
        // overwrite a photo the user already uploaded themselves.
        if (!$user->avatar_url && $googleUser->getAvatar()) {
            $user->avatar_url = $googleUser->getAvatar();
            $user->save();
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        // Redirect back to the frontend, carrying the token.
        $frontendUrl = 'http://127.0.0.1:8000/google-callback?token=' . $token . '&remember=' . $remember;
        return redirect($frontendUrl);
    }
}
