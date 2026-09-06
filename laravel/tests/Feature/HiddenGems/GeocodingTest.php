<?php

namespace Tests\Feature\HiddenGems;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GeocodingTest extends TestCase
{
    use RefreshDatabase;

    public static function stateAddresses(): array
    {
        $cases = [];
        foreach (['Kuala Lumpur', 'Selangor', 'Johor', 'Penang', 'Melaka', 'Negeri Sembilan', 'Perak', 'Pahang', 'Kedah', 'Perlis', 'Kelantan', 'Terengganu', 'Sabah', 'Sarawak', 'Putrajaya', 'Labuan'] as $state) {
            $cases[$state] = [['state' => $state], $state];
        }

        return $cases + [
            'Malay Penang' => [['state' => 'Pulau Pinang'], 'Penang'],
            'English Melaka' => [['state' => 'Malacca'], 'Melaka'],
            'Malay territory' => [['state' => 'Wilayah Persekutuan Kuala Lumpur'], 'Kuala Lumpur'],
            'English territory' => [['region' => 'Federal Territory of Kuala Lumpur'], 'Kuala Lumpur'],
            'case and spacing' => [['state' => '  pulau   pinang  '], 'Penang'],
            'region after unrecognized state' => [['state' => 'Unknown', 'region' => 'Selangor'], 'Selangor'],
            'territory city fallback' => [['city' => 'Kuala Lumpur'], 'Kuala Lumpur'],
            'Putrajaya fallback' => [['municipality' => 'Putrajaya'], 'Putrajaya'],
            'Labuan fallback' => [['county' => 'Labuan'], 'Labuan'],
            'state takes precedence' => [['state' => 'Selangor', 'city' => 'Kuala Lumpur'], 'Selangor'],
            'no ordinary city guessing' => [['city' => 'Johor'], ''],
            'unknown' => [[], ''],
        ];
    }

    #[DataProvider('stateAddresses')]
    public function test_address_lookup_and_map_selection_return_dropdown_state_names(array $address, string $expected): void
    {
        $result = [
            'lat' => '3.14', 'lon' => '101.7',
            'display_name' => 'Example address, Malaysia',
            'address' => $address + ['country_code' => 'my'],
        ];
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([$result]),
            'nominatim.openstreetmap.org/reverse*' => Http::response($result),
        ]);

        $this->getJson('/api/hidden-gems/geocode?query=Example')
            ->assertOk()->assertJsonPath('state', $expected);
        $this->getJson('/api/hidden-gems/reverse-geocode-address?latitude=3.14&longitude=101.7')
            ->assertOk()->assertJsonPath('state', $expected);
    }

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Sanctum::actingAs(User::factory()->create());
    }

    public function test_geocode_preserves_the_existing_response_contract(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/search*' => Http::response([[
                'lat' => '5.4164',
                'lon' => '100.3327',
                'display_name' => '12 Jalan Example, George Town, Malaysia',
                'address' => [
                    'house_number' => '12',
                    'road' => 'Jalan Example',
                    'state' => 'Pulau Pinang',
                    'postcode' => '10450',
                    'country_code' => 'my',
                ],
            ]]),
        ]);

        $this->getJson('/api/hidden-gems/geocode?query=12%20Jalan%20Example')
            ->assertOk()
            ->assertJson([
                'latitude' => 5.4164,
                'longitude' => 100.3327,
                'state' => 'Penang',
                'postcode' => '10450',
                'country_code' => 'my',
                'is_specific' => true,
            ]);
    }

    public function test_reverse_geocode_rejects_locations_outside_malaysia(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/reverse*' => Http::response([
                'osm_name' => 'Singapore',
                'osm_id' => 123,
                'osm_type' => 'node',
                'display_name' => 'Singapore',
                'address' => ['country_code' => 'sg'],
            ]),
        ]);

        $this->getJson('/api/hidden-gems/reverse-geocode?latitude=1.3&longitude=103.8')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That point is outside Malaysia. Please pick a location within the country.');
    }

    public function test_reverse_address_removes_duplicate_address_parts(): void
    {
        Http::fake([
            'nominatim.openstreetmap.org/reverse*' => Http::response([
                'display_name' => 'Jalan Alor, Kuala Lumpur, Malaysia',
                'address' => [
                    'road' => 'Jalan Alor',
                    'suburb' => 'Bukit Bintang',
                    'city' => 'Bukit Bintang',
                    'state' => 'Wilayah Persekutuan Kuala Lumpur',
                    'postcode' => '50200',
                    'country_code' => 'my',
                ],
            ]),
        ]);

        $this->getJson('/api/hidden-gems/reverse-geocode-address?latitude=3.1446&longitude=101.7078')
            ->assertOk()
            ->assertJson([
                'address' => 'Jalan Alor, Bukit Bintang',
                'state' => 'Kuala Lumpur',
                'postcode' => '50200',
            ]);
    }
}
