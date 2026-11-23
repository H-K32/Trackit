<?php

namespace App\Http\Requests;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;

class StoreTrackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tomorrow = Carbon::tomorrow($this->user()->timezone)->toDateString();

        return [
            'name'          => ['required', 'string', 'max:255'],
            'description'   => ['nullable', 'string'],
            'start_date'    => ['required', 'date', 'after_or_equal:' . $tomorrow],
            'duration_days' => ['required', 'integer', 'min:1'],
            'user_id'       => ['prohibited'],
            'status'        => ['prohibited'],
        ];
    }
}
