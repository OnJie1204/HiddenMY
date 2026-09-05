<?php

namespace App\Integrations\Wikimedia;

use Illuminate\Support\Facades\Http;

class WikidataClient
{
    /** @return array<string, string> Wikidata ID to Commons image URL. */
    public function imageUrls(iterable $ids): array
    {
        $response = Http::withUserAgent(config('app.name', 'Gemora').' attraction images')
            ->timeout((int) config('services.wikidata.timeout', 5))
            ->get((string) config('services.wikidata.url'), [
                'action' => 'wbgetentities',
                'ids' => collect($ids)->implode('|'),
                'props' => 'claims',
                'format' => 'json',
            ])
            ->throw()
            ->json();

        $images = [];
        foreach ($response['entities'] ?? [] as $id => $entity) {
            $filename = $entity['claims']['P18'][0]['mainsnak']['datavalue']['value'] ?? null;
            if ($filename) {
                $images[$id] = rtrim((string) config('services.wikimedia.file_url'), '/')
                    .'/'.rawurlencode($filename).'?width=400';
            }
        }

        return $images;
    }
}
