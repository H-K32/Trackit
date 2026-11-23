<?php

namespace Database\Factories;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<\App\Models\Track>
 */
class TrackFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'       => User::factory(),
            'name'          => fake()->sentence(3),
            'description'   => fake()->optional()->paragraph(),
            'start_date'    => Carbon::tomorrow()->toDateString(),
            'duration_days' => fake()->numberBetween(1, 90),
        ];
    }

    /** Track has not started yet (start_date is in the future). */
    public function upcoming(): static
    {
        return $this->state(fn () => [
            'start_date'    => Carbon::today('UTC')->addDays(3)->toDateString(),
            'duration_days' => 30,
        ]);
    }

    /** Track is currently active (started in the past, ends in the future). */
    public function active(): static
    {
        return $this->state(fn () => [
            'start_date'    => Carbon::today()->subDays(5)->toDateString(),
            'duration_days' => 30,
        ]);
    }

    /** Track has fully expired (end date is in the past). */
    public function expired(): static
    {
        return $this->state(fn () => [
            'start_date'    => Carbon::today()->subDays(40)->toDateString(),
            'duration_days' => 30,
        ]);
    }
}
