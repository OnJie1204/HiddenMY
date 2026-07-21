<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(function ($user, string $token) {
            return 'http://127.0.0.1:8000/reset-password?token=' . $token . '&email=' . urlencode($user->email);
        });

        VerifyEmail::toMailUsing(function ($notifiable, $url) {
            $frontendUrl = str_replace(
                url('/api'),
                'http://127.0.0.1:8000',
                $url
            );

            return (new MailMessage)
                ->subject('Verify Your Email Address')
                ->line('Please click the button below to verify your email address.')
                ->action('Verify Email Address', $frontendUrl);
        });
    }
}
