<?php

namespace App\Integrations\Geocoding;

use Illuminate\Support\Facades\Http;

class NominatimClient
{
    public function search(array $parameters, string $purpose): array
    {
        return $this->request('search', $parameters, $purpose);
    }

    public function reverse(float $latitude, float $longitude, string $purpose): array
    {
        return $this->request('reverse', [
            'lat' => $latitude,
            'lon' => $longitude,
            'format' => 'jsonv2',
            'addressdetails' => 1,
        ], $purpose);
    }

    private function request(string $endpoint, array $parameters, string $purpose): array
    {
        return Http::acceptJson()
            ->withUserAgent(config('app.name', 'Gemora').' '.$purpose)
            ->timeout((int) config('services.nominatim.timeout', 5))
            ->get(rtrim((string) config('services.nominatim.url'), '/').'/'.$endpoint, $parameters)
            ->throw()
            ->json();
    }
}
