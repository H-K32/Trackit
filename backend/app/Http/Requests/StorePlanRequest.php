<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title'     => ['required', 'string', 'max:255'],
            'content'   => ['nullable', 'string', 'max:20000'],
            'plan_date' => ['nullable', 'date_format:Y-m-d'],
            'is_pinned' => ['sometimes', 'boolean'],
            'user_id'   => ['prohibited'],
        ];
    }
}
