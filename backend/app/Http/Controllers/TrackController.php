<?php

namespace App\Http\Controllers;

use App\Enums\TrackStatus;
use App\Http\Requests\StoreTrackRequest;
use App\Http\Requests\UpdateTrackRequest;
use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use App\Services\TrackProgressService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrackController extends Controller
{
    public function __construct(private TrackProgressService $service) {}

    public function index(Request $request): JsonResponse
    {
        $tracks = $request->user()
            ->tracks()
            ->with('user')
            ->get();

        if ($request->query('include') === 'progress') {
            $this->attachProgress($tracks, $request->user()->timezone ?? 'UTC');
        }

        return response()->json($tracks->map(fn (Track $t) => $this->format($t, $request->query('include') === 'progress')));
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

    /**
     * Load activities and logs for all tracks in 2 queries, then attach
     * a compact progress object to each Track model as a dynamic property.
     */
    private function attachProgress($tracks, string $timezone): void
    {
        if ($tracks->isEmpty()) {
            return;
        }

        $trackIds    = $tracks->pluck('id')->all();
        $activities  = Activity::whereIn('track_id', $trackIds)->get()->groupBy('track_id');

        // Determine the date window per track and collect all needed dates.
        $tz    = new \DateTimeZone($timezone);
        $today = \Carbon\Carbon::now($tz)->toDateString();

        $allActivityIds = $activities->flatten()->pluck('id')->all();
        $allLogs = $allActivityIds
            ? DailyLog::whereIn('activity_id', $allActivityIds)->get()->groupBy('activity_id')
            : collect();

        foreach ($tracks as $track) {
            $trackActivities = $activities->get($track->id, collect());
            $track->setRelation('activities', $trackActivities);

            // Pre-populate the allLogs structure the service expects.
            $logsForTrack = collect();
            foreach ($trackActivities as $activity) {
                $logsForTrack->put($activity->id, $allLogs->get($activity->id, collect()));
            }

            $summary = $this->service->trackSummary($track, $timezone, $logsForTrack);

            $track->_progress = [
                'overall_percentage'  => $summary['overall_percentage'],
                'challenge_progress'  => $summary['challenge_progress'],
                'completed_days'      => $summary['completed_days'],
                'elapsed_days'        => $summary['elapsed_days'],
                'total_days'          => $summary['total_days'],
                'days_remaining'      => $summary['days_remaining'],
                'today'               => $summary['today'] ? [
                    'date'                  => $summary['today']['date'],
                    'day_status'            => $summary['today']['day_status'],
                    'completion_percentage' => $summary['today']['completion_percentage'],
                ] : null,
            ];
        }
    }

    private function format(Track $track, bool $withProgress = false): array
    {
        $base = [
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

        if ($withProgress) {
            $base['progress'] = $track->_progress ?? null;
        }

        return $base;
    }
}
