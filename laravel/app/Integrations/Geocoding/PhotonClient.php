<?php

namespace App\Integrations\Geocoding;

use Illuminate\Support\Facades\Http;

class PhotonClient
{
    public function autocomplete(array $parameters): array
    {
        return Http::acceptJson()
            ->withUserAgent(config('app.name', 'Gemora').' address autocomplete')
            ->timeout((int) config('services.photon.timeout', 5))
            ->get(rtrim((string) config('services.photon.url'), '/').'/api', $parameters)
            ->throw()
            ->json('features', []);
    }
}
