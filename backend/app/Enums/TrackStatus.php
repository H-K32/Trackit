<?php

namespace App\Enums;

use Carbon\Carbon;

enum TrackStatus: string
{
    case Upcoming = 'upcoming';
    case Active   = 'active';
    case Expired  = 'expired';

    /**
     * Derive status purely from dates, using the user's timezone.
     *
     * @param  string|\DateTimeInterface  $startDate
     * @param  int                        $durationDays
     * @param  string                     $timezone      IANA timezone string
     */
    public static function calculate(
        string|\DateTimeInterface $startDate,
        int $durationDays,
        string $timezone = 'UTC',
    ): self {
        $tz    = new \DateTimeZone($timezone);
        $today = Carbon::now($tz)->startOfDay();
        $start = Carbon::parse($startDate, $tz)->startOfDay();
        $end   = $start->copy()->addDays($durationDays - 1)->endOfDay();

        if ($today->lt($start)) {
            return self::Upcoming;
        }

        if ($today->gt($end)) {
            return self::Expired;
        }

        return self::Active;
    }
}
