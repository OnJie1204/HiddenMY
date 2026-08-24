<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Location;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Location>
 */
class LocationFactory extends Factory
{
    protected $model = Location::class;

    private const STATES = [
        'Johor', 'Kuala Lumpur', 'Penang', 'Selangor', 'Melaka', 'Perak',
        'Pahang', 'Sarawak', 'Sabah', 'Terengganu', 'Kelantan', 'Kedah',
        'Negeri Sembilan', 'Perlis', 'Putrajaya', 'Labuan',
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'category_id' => Category::factory(),
            'place_name' => fake()->unique()->company().' '.fake()->randomElement(['Waterfall', 'Homestay', 'Kuih', 'Cafe', 'Trail']),
            'address' => fake()->streetAddress(),
            'state' => fake()->randomElement(self::STATES),
            'postcode' => fake()->numberBetween(10000, 98000),
            'description' => fake()->paragraph(),
            // Roughly within Malaysia's bounding box.
            'latitude' => fake()->latitude(0.8, 6.5),
            'longitude' => fake()->longitude(99.6, 119.3),
            'status' => 'pending',
            'vote_count' => 0,
            'verification_threshold' => 10,
        ];
    }
}
