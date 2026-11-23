<?php

namespace Database\Factories;

use App\Enums\TrackingType;
use App\Models\Track;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<\App\Models\Activity>
 */
class ActivityFactory extends Factory
{
    public function definition(): array
    {
        return [
            'track_id'      => Track::factory(),
            'name'          => fake()->unique()->words(3, true),
            'description'   => fake()->optional()->sentence(),
            'tracking_type' => TrackingType::Count->value,
            'daily_target'  => fake()->numberBetween(1, 20),
            'unit'          => 'sessions',
            'is_required'   => true,
        ];
    }

    public function count_type(): static
    {
        return $this->state(fn () => [
            'tracking_type' => TrackingType::Count->value,
            'daily_target'  => 5,
            'unit'          => 'games',
        ]);
    }

    public function duration(): static
    {
        return $this->state(fn () => [
            'tracking_type' => TrackingType::Duration->value,
            'daily_target'  => 30,
            'unit'          => 'minutes',
        ]);
    }

    public function checkbox(): static
    {
        return $this->state(fn () => [
            'tracking_type' => TrackingType::Checkbox->value,
            'daily_target'  => 1,
            'unit'          => null,
        ]);
    }
}
