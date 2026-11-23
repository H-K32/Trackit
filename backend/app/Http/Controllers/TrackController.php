<?php

namespace App\Http\Controllers;

use App\Enums\TrackStatus;
use App\Http\Requests\StoreTrackRequest;
use App\Http\Requests\UpdateTrackRequest;
use App\Models\Track;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tracks = $request->user()
            ->tracks()
            ->with('user')
            ->get()
            ->map(fn (Track $t) => $this->format($t));

        return response()->json($tracks);
    }

    public function store(StoreTrackRequest $request): JsonResponse
    {
        $track = $request->user()->tracks()->create($request->validated());
        $track->load('user');

        return response()->json($this->format($track), 201);
    }

    public function show(Request $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);
        $track->load('user');

        return response()->json($this->format($track));
    }

    public function update(UpdateTrackRequest $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);
        $track->load('user');

        if ($track->status !== TrackStatus::Upcoming->value) {
            $startChanged    = $request->has('start_date')
                && Carbon::parse($request->input('start_date'))->toDateString()
                   !== $track->start_date->toDateString();

            $durationChanged = $request->has('duration_days')
                && (int) $request->input('duration_days') !== $track->duration_days;

            if ($startChanged || $durationChanged) {
                return response()->json([
                    'message' => 'The track schedule cannot be changed after it has started.',
                    'code'    => 'track_started',
                ], 409);
            }
        }

        $track->update($request->validated());
        $track->refresh();

        return response()->json($this->format($track));
    }

    public function destroy(Request $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);
        $track->delete();

        return response()->json(null, 204);
    }

    private function authorizeTrack(Request $request, Track $track): void
    {
        abort_if($track->user_id !== $request->user()->id, 403);
    }

    private function format(Track $track): array
    {
        return [
            'id'            => $track->id,
            'user_id'       => $track->user_id,
            'name'          => $track->name,
            'description'   => $track->description,
            'start_date'    => $track->start_date->toDateString(),
            'end_date'      => $track->end_date,
            'duration_days' => $track->duration_days,
            'status'        => $track->status,
            'created_at'    => $track->created_at,
            'updated_at'    => $track->updated_at,
        ];
    }
}
