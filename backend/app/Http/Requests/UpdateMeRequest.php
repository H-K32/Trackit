<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $user           = $this->user();
        $emailChanging  = $this->has('email')
            && strtolower((string) $this->input('email')) !== strtolower($user->email);

        return [
            'name'             => ['sometimes', 'string', 'max:255'],
            'email'            => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'current_password' => $emailChanging
                ? ['required', 'current_password']
                : ['sometimes'],
            'timezone'         => ['sometimes', 'string', 'timezone:all'],
        ];
    }
}
