<?php

namespace Database\Factories;

use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    protected $model = Category::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->randomElement([
                'Nature', 'Waterfall', 'Hiking', 'Beach', 'Food',
                'Local Shop', 'Handicrafts', 'Culture', 'History', 'Recreation',
            ]).' '.fake()->unique()->numberBetween(1, 100000),
        ];
    }
}
