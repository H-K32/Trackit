<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

class ActivityTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(config('activity_templates'));
    }
}
