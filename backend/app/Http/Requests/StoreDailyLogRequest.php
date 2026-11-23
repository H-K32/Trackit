<?php

namespace App\Http\Requests;

use App\Enums\TrackingType;
use App\Models\Activity;
use App\Models\Track;
use Illuminate\Foundation\Http\FormRequest;

class StoreDailyLogRequest extends FormRequest
{
    /**
     * Ownership check runs here — before any validation — so a non-owner
     * always gets 403, never a 422 from body validation.
     */
    public function authorize(): bool
    {
        $track = $this->route('track');

        if (! $track instanceof Track) {
            return false;
        }

        return $track->user_id === $this->user()->id;
    }

    public function rules(): array
    {
        $activity = $this->route('activity');
        $type     = $activity instanceof Activity ? $activity->tracking_type : null;

        return [
            'value'        => $this->valueRules($type),
            'is_completed' => $this->completedRules($type),
            'notes'        => ['sometimes', 'nullable', 'string', 'max:1000'],
            'activity_id'  => ['prohibited'],
            'track_id'     => ['prohibited'],
            'user_id'      => ['prohibited'],
        ];
    }

    private function valueRules(?TrackingType $type): array
    {
        if ($type === TrackingType::Checkbox) {
            return ['prohibited'];
        }

        if ($type === TrackingType::Duration) {
            return ['required', 'integer', 'min:0', 'max:1440'];
        }

        // Count (and unknown/null type fallback)
        return ['required', 'integer', 'min:0', 'max:10000'];
    }

    private function completedRules(?TrackingType $type): array
    {
        if ($type === TrackingType::Checkbox) {
            return ['required', 'boolean'];
        }

        return ['prohibited'];
    }
}
