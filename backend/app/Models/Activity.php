<?php

namespace App\Models;

use App\Enums\TrackingType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Activity extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'tracking_type',
        'daily_target',
        'unit',
        'is_required',
    ];

    protected function casts(): array
    {
        return [
            'tracking_type' => TrackingType::class,
            'daily_target'  => 'integer',
            'is_required'   => 'boolean',
        ];
    }

    public function track(): BelongsTo
    {
        return $this->belongsTo(Track::class);
    }

    public function dailyLogs(): HasMany
    {
        return $this->hasMany(DailyLog::class);
    }
}
