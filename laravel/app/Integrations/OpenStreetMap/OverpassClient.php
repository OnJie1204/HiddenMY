<?php

namespace App\Integrations\OpenStreetMap;

use Illuminate\Support\Facades\Http;

class OverpassClient
{
    public function query(string $query, int $timeout): array
    {
        return Http::asForm()
            ->withUserAgent(config('app.name', 'Gemora').' nearby attractions')
            ->timeout($timeout)
            ->post((string) config('services.overpass.url'), ['data' => $query])
            ->throw()
            ->json('elements', []);
    }
}
