<?php

namespace App\Integrations\Http;

use Illuminate\Support\Facades\Http;

class RemoteImageFetcher
{
    /** @return array{mime_type: string, data: string} */
    public function inlineData(string $url, string $defaultMimeType = 'image/jpeg'): array
    {
        $response = Http::timeout((int) config('services.remote_images.timeout', 15))
            ->get($url)
            ->throw();

        $mimeType = explode(';', $response->header('Content-Type') ?: $defaultMimeType)[0];

        return ['mime_type' => $mimeType, 'data' => base64_encode($response->body())];
    }
}
