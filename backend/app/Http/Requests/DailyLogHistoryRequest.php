<?php

namespace App\Http\Requests;

use App\Models\Track;
use Carbon\Carbon;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class DailyLogHistoryRequest extends FormRequest
{
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
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to'   => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function () use ($validator) {
            if ($validator->errors()->hasAny(['from', 'to'])) {
                return;
            }

            $from = Carbon::parse($this->input('from'));
            $to   = Carbon::parse($this->input('to'));

            if ($from->diffInDays($to) > 366) {
                throw new HttpResponseException(
                    response()->json([
                        'message' => 'The date range may not exceed 366 days.',
                        'errors'  => ['to' => ['The date range may not exceed 366 days.']],
                    ], 422)
                );
            }
        });
    }
}
