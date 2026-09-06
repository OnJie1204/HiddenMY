<?php

namespace App\Providers;

use App\Contracts\ObjectStorage;
use App\Integrations\Storage\SupabaseStorage;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(ObjectStorage::class, SupabaseStorage::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->environment('production')) {
            URL::forceScheme('https');
        }

        ResetPassword::createUrlUsing(function ($user, string $token) {
            return rtrim((string) config('app.url'), '/').'/reset-password?'.http_build_query([
                'token' => $token,
                'email' => $user->email,
            ]);
        });

        VerifyEmail::toMailUsing(function ($notifiable, $url) {
            $frontendUrl = str_replace(
                url('/api'),
                rtrim((string) config('app.url'), '/'),
                $url
            );

            return (new MailMessage)
                ->subject('Verify Your Email Address')
                ->line('Please click the button below to verify your email address.')
                ->action('Verify Email Address', $frontendUrl);
        });
    }
}
