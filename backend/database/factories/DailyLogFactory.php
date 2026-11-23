<?php

namespace Database\Factories;

use App\Models\Activity;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<\App\Models\DailyLog>
 */
class DailyLogFactory extends Factory
{
    public function definition(): array
    {
        return [
            'activity_id'  => Activity::factory(),
            'log_date'     => Carbon::today()->toDateString(),
            'value'        => fake()->numberBetween(0, 20),
            'is_completed' => null,
            'notes'        => null,
        ];
    }

    /** Log for a count or duration activity (numeric value). */
    public function withValue(int $value): static
    {
        return $this->state(fn () => [
            'value'        => $value,
            'is_completed' => null,
        ]);
    }

    /** Log for a checkbox activity. */
    public function checkbox(bool $completed = true): static
    {
        return $this->state(fn () => [
            'value'        => null,
            'is_completed' => $completed,
        ]);
    }
}
