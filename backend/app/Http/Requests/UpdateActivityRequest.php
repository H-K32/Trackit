<?php

namespace App\Http\Requests;

use App\Enums\TrackingType;
use App\Models\Activity;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateActivityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Resolve the effective tracking type: use the submitted value if
        // present, otherwise fall back to the stored value on the activity.
        $activity    = $this->route('activity');
        $storedType  = $activity instanceof Activity ? $activity->tracking_type : null;
        $type        = TrackingType::tryFrom($this->input('tracking_type', $storedType?->value));

        return [
            'name'          => ['sometimes', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'tracking_type' => ['sometimes', Rule::enum(TrackingType::class)],
            'daily_target'  => $this->targetRules($type),
            'unit'          => $this->unitRules($type),
            'is_required'   => ['sometimes', 'boolean'],
            'track_id'      => ['prohibited'],
            'user_id'       => ['prohibited'],
        ];
    }

    private function targetRules(?TrackingType $type): array
    {
        if ($type === TrackingType::Checkbox) {
            return ['sometimes', 'integer', 'in:1'];
        }

        return ['sometimes', 'integer', 'min:1'];
    }

    private function unitRules(?TrackingType $type): array
    {
        if ($type === TrackingType::Duration) {
            return ['sometimes', 'nullable', Rule::in(['minutes'])];
        }

        if ($type === TrackingType::Checkbox) {
            return ['sometimes', 'nullable'];
        }

        // count
        return ['sometimes', 'string', 'max:30'];
    }
}
