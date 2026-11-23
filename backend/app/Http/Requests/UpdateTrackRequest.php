<?php

namespace App\Http\Requests;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;

class UpdateTrackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $track    = $this->route('track');
        $rules    = [
            'name'          => ['sometimes', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'start_date'    => ['sometimes', 'date'],
            'duration_days' => ['sometimes', 'integer', 'min:1'],
            'user_id'       => ['prohibited'],
            'status'        => ['prohibited'],
        ];

        // Only enforce "tomorrow or later" when the submitted start_date
        // actually differs from the stored one (compared as Y-m-d strings).
        if ($this->has('start_date') && $track) {
            $stored    = $track->start_date->toDateString();
            $submitted = Carbon::parse($this->input('start_date'))->toDateString();

            if ($submitted !== $stored) {
                $tomorrow = Carbon::tomorrow($this->user()->timezone)->toDateString();
                $rules['start_date'][] = 'after_or_equal:' . $tomorrow;
            }
        }

        return $rules;
    }
}
