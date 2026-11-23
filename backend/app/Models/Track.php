<?php

namespace App\Models;

use App\Enums\TrackStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Track extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'start_date',
        'duration_days',
    ];

    protected function casts(): array
    {
        return [
            'start_date'    => 'date',
            'duration_days' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    /** Calculated end date (start_date + duration_days - 1). */
    public function getEndDateAttribute(): string
    {
        return $this->start_date->copy()->addDays($this->duration_days - 1)->toDateString();
    }

    /** Date-based status derived from the owning user's timezone. */
    public function getStatusAttribute(): string
    {
        $timezone = $this->relationLoaded('user')
            ? $this->user->timezone
            : ($this->user()->value('timezone') ?? 'UTC');

        return TrackStatus::calculate(
            $this->start_date,
            $this->duration_days,
            $timezone,
        )->value;
    }
}
