<?php

namespace App\Enums;

enum TrackingType: string
{
    case Count    = 'count';
    case Duration = 'duration';
    case Checkbox = 'checkbox';

    /** Unit is fixed server-side for these types; null means no unit. */
    public function fixedUnit(): ?string
    {
        return match ($this) {
            self::Duration => 'minutes',
            self::Checkbox => null,
            self::Count    => null,   // free text — not fixed
        };
    }

    /** Whether this type requires a user-supplied unit. */
    public function requiresUnit(): bool
    {
        return $this === self::Count;
    }

    /** Whether the daily_target is always forced to 1. */
    public function forcesTargetOne(): bool
    {
        return $this === self::Checkbox;
    }
}
