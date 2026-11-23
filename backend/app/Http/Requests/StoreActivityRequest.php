<?php

namespace App\Http\Requests;

use App\Enums\TrackingType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreActivityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $type = TrackingType::tryFrom($this->input('tracking_type'));

        return [
            'name'          => ['required', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'tracking_type' => ['required', Rule::enum(TrackingType::class)],
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
            // Must be omitted or exactly 1; we set it server-side anyway.
            return ['sometimes', 'integer', 'in:1'];
        }

        return ['required', 'integer', 'min:1'];
    }

    private function unitRules(?TrackingType $type): array
    {
        if ($type === TrackingType::Duration) {
            return ['sometimes', 'nullable', Rule::in(['minutes'])];
        }

        if ($type === TrackingType::Checkbox) {
            return ['sometimes', 'nullable'];
        }

        // count — required free text
        return ['required', 'string', 'max:30'];
    }
}
