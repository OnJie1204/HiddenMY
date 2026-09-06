<?php

namespace Tests\Feature\System;

use App\Integrations\Http\RemoteImageFetcher;
use App\Integrations\OpenStreetMap\OverpassClient;
use App\Integrations\Wikimedia\WikidataClient;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ProviderClientsTest extends TestCase
{
    public function test_overpass_client_returns_elements_from_the_configured_endpoint(): void
    {
        config(['services.overpass.url' => 'https://overpass.example/api']);
        Http::fake(['overpass.example/*' => Http::response([
            'elements' => [['type' => 'node', 'id' => 123]],
        ])]);

        $elements = app(OverpassClient::class)->query('[out:json];node(1);out;', 3);

        $this->assertSame([['type' => 'node', 'id' => 123]], $elements);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request->url() === 'https://overpass.example/api');
    }

    public function test_wikidata_client_translates_image_claims_to_commons_urls(): void
    {
        config([
            'services.wikidata.url' => 'https://wikidata.example/api.php',
            'services.wikimedia.file_url' => 'https://commons.example/files',
        ]);
        Http::fake(['wikidata.example/*' => Http::response([
            'entities' => [
                'Q42' => ['claims' => ['P18' => [[
                    'mainsnak' => ['datavalue' => ['value' => 'Example Photo.jpg']],
                ]]]],
            ],
        ])]);

        $images = app(WikidataClient::class)->imageUrls(['Q42']);

        $this->assertSame(
            ['Q42' => 'https://commons.example/files/Example%20Photo.jpg?width=400'],
            $images,
        );
    }

    public function test_remote_image_fetcher_returns_gemini_inline_data(): void
    {
        Http::fake(['images.example/*' => Http::response('image-bytes', headers: [
            'Content-Type' => 'image/png; charset=binary',
        ])]);

        $inline = app(RemoteImageFetcher::class)->inlineData('https://images.example/photo.png');

        $this->assertSame('image/png', $inline['mime_type']);
        $this->assertSame(base64_encode('image-bytes'), $inline['data']);
    }
}
