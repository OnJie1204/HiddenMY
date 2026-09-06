<?php

namespace Tests\Feature\HiddenGems;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AddressAutocompleteTest extends TestCase
{
    use RefreshDatabase;

    private function photonFeature(array $properties, array $coordinates): array
    {
        return [
            'type' => 'Feature',
            'properties' => $properties,
            'geometry' => ['type' => 'Point', 'coordinates' => $coordinates],
        ];
    }

    private function actingUser(): User
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_it_requires_authentication(): void
    {
        Http::fake();

        $this->getJson('/api/hidden-gems/address-autocomplete?query=jalan')
            ->assertUnauthorized();

        Http::assertNothingSent();
    }

    public function test_it_normalises_photon_results_for_the_form(): void
    {
        $this->actingUser();

        Http::fake([
            'photon.komoot.io/*' => Http::response([
                'features' => [
                    $this->photonFeature([
                        'name' => 'Warung Mak Long',
                        'street' => 'Jalan Kenanga',
                        'housenumber' => '12',
                        'district' => 'Bukit Bintang',
                        'state' => 'Pulau Pinang',
                        'postcode' => '10450',
                        'countrycode' => 'MY',
                    ], [100.3299, 5.4200]),
                ],
            ]),
        ]);

        $response = $this->getJson('/api/hidden-gems/address-autocomplete?query=warung mak long')
            ->assertOk();

        $suggestion = $response->json('data.0');

        $this->assertSame('Warung Mak Long, 12 Jalan Kenanga, Bukit Bintang', $suggestion['address']);
        $this->assertSame('Penang', $suggestion['state']); // Pulau Pinang -> Penang
        $this->assertSame('10450', $suggestion['postcode']);
        $this->assertSame(5.42, $suggestion['latitude']);
        $this->assertSame(100.3299, $suggestion['longitude']);
    }

    public function test_it_drops_non_malaysian_results(): void
    {
        $this->actingUser();

        Http::fake([
            'photon.komoot.io/*' => Http::response([
                'features' => [
                    $this->photonFeature([
                        'name' => 'Jalan Besar',
                        'city' => 'Singapore',
                        'countrycode' => 'SG',
                    ], [103.85, 1.30]),
                    $this->photonFeature([
                        'name' => 'Jalan Besar',
                        'city' => 'Ipoh',
                        'state' => 'Perak',
                        'postcode' => '30000',
                        'countrycode' => 'MY',
                    ], [101.07, 4.60]),
                ],
            ]),
        ]);

        $data = $this->getJson('/api/hidden-gems/address-autocomplete?query=jalan besar')
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $data);
        $this->assertSame('Perak', $data[0]['state']);
    }

    public function test_federal_territory_state_falls_back_to_city(): void
    {
        $this->actingUser();

        Http::fake([
            'photon.komoot.io/*' => Http::response([
                'features' => [
                    // KL comes through with no `state` field
                    $this->photonFeature([
                        'name' => 'Jalan Alor',
                        'district' => 'Bukit Bintang',
                        'city' => 'Kuala Lumpur',
                        'postcode' => '50200',
                        'countrycode' => 'MY',
                    ], [101.7078, 3.1446]),
                ],
            ]),
        ]);

        $suggestion = $this->getJson('/api/hidden-gems/address-autocomplete?query=jalan alor')
            ->assertOk()
            ->json('data.0');

        $this->assertSame('Kuala Lumpur', $suggestion['state']);
    }

    public function test_photon_outage_returns_502_not_a_500(): void
    {
        $this->actingUser();

        Http::fake([
            'photon.komoot.io/*' => Http::response('upstream error', 503),
        ]);

        $this->getJson('/api/hidden-gems/address-autocomplete?query=jalan ampang')
            ->assertStatus(502)
            ->assertJsonStructure(['message']);
    }

    public function test_short_queries_are_rejected_without_calling_photon(): void
    {
        $this->actingUser();
        Http::fake();

        $this->getJson('/api/hidden-gems/address-autocomplete?query=jl')
            ->assertStatus(422);

        Http::assertNothingSent();
    }

    public function test_results_are_cached_so_repeat_keystrokes_dont_refetch(): void
    {
        $this->actingUser();

        Http::fake([
            'photon.komoot.io/*' => Http::response([
                'features' => [
                    $this->photonFeature([
                        'name' => 'Jalan Ampang',
                        'state' => 'Selangor',
                        'postcode' => '68000',
                        'countrycode' => 'MY',
                    ], [101.75, 3.16]),
                ],
            ]),
        ]);

        $this->getJson('/api/hidden-gems/address-autocomplete?query=jalan ampang')->assertOk();
        $this->getJson('/api/hidden-gems/address-autocomplete?query=Jalan Ampang')->assertOk();

        Http::assertSentCount(1);
    }
}
