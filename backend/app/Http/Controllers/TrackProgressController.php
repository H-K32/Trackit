<?php

namespace App\Http\Controllers;

use App\Models\Track;
use App\Services\TrackProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackProgressController extends Controller
{
    public function __construct(private TrackProgressService $service) {}

    public function show(Request $request, Track $track): JsonResponse
    {
        abort_if($track->user_id !== $request->user()->id, 403);

        $track->loadMissing('user');
        $timezone = $track->user->timezone ?? 'UTC';

        return response()->json(
            $this->service->trackSummary($track, $timezone)
        );
    }

    public function calendar(Request $request, Track $track): JsonResponse
    {
        abort_if($track->user_id !== $request->user()->id, 403);

        $track->loadMissing('user');
        $timezone = $track->user->timezone ?? 'UTC';

        return response()->json(
            $this->service->calendarDays($track, $timezone)
        );
    }

    public function analytics(Request $request, Track $track): JsonResponse
    {
        abort_if($track->user_id !== $request->user()->id, 403);

        $track->loadMissing('user');
        $timezone = $track->user->timezone ?? 'UTC';

        return response()->json(
            $this->service->analytics($track, $timezone)
        );
    }
}
