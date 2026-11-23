<?php

namespace App\Http\Controllers;

use App\Enums\TrackingType;
use App\Enums\TrackStatus;
use App\Http\Requests\StoreActivityRequest;
use App\Http\Requests\UpdateActivityRequest;
use App\Models\Activity;
use App\Models\Track;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function index(Request $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        return response()->json(
            $track->activities->map(fn (Activity $a) => $this->format($a))
        );
    }

    public function store(StoreActivityRequest $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);
        $this->assertTrackIsUpcoming($track);
        $this->assertUnderActivityLimit($track);
        $this->assertUniqueName($track, $request->input('name'));

        $data = $this->normalizeData($request->validated());

        $activity = $track->activities()->create($data);

        return response()->json($this->format($activity), 201);
    }

    public function show(Request $request, Track $track, Activity $activity): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        return response()->json($this->format($activity));
    }

    public function update(UpdateActivityRequest $request, Track $track, Activity $activity): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        $track->load('user');
        $isUpcoming = $track->status === TrackStatus::Upcoming->value;

        if (! $isUpcoming) {
            $this->assertOnlyNameOrDescription($request, $activity);
        }

        if ($request->has('name') && strtolower($request->input('name')) !== strtolower($activity->name)) {
            $this->assertUniqueName($track, $request->input('name'), $activity->id);
        }

        $data = $this->normalizeData($request->validated());
        $activity->update($data);

        return response()->json($this->format($activity->fresh()));
    }

    public function destroy(Request $request, Track $track, Activity $activity): JsonResponse
    {
        $this->authorizeTrack($request, $track);
        $this->assertTrackIsUpcoming($track);

        $activity->delete();

        return response()->json(null, 204);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function authorizeTrack(Request $request, Track $track): void
    {
        abort_if($track->user_id !== $request->user()->id, 403);
    }

    private function assertTrackIsUpcoming(Track $track): void
    {
        $track->loadMissing('user');

        if ($track->status !== TrackStatus::Upcoming->value) {
            abort(response()->json([
                'message' => 'Activities can no longer be changed because this track has started.',
                'code'    => 'activities_locked',
            ], 409));
        }
    }

    private function assertUnderActivityLimit(Track $track): void
    {
        if ($track->activities()->count() >= 20) {
            abort(response()->json([
                'message' => 'A track cannot have more than 20 activities.',
                'code'    => 'activity_limit_reached',
            ], 422));
        }
    }

    private function assertUniqueName(Track $track, string $name, ?int $excludeId = null): void
    {
        $query = $track->activities()
            ->whereRaw('LOWER(name) = ?', [strtolower($name)]);

        if ($excludeId !== null) {
            $query->where('id', '!=', $excludeId);
        }

        if ($query->exists()) {
            abort(response()->json([
                'message'  => 'The name has already been taken.',
                'errors'   => ['name' => ['The name has already been taken.']],
            ], 422));
        }
    }

    private function assertOnlyNameOrDescription(UpdateActivityRequest $request, Activity $activity): void
    {
        $lockedFields = ['tracking_type', 'daily_target', 'unit', 'is_required'];

        foreach ($lockedFields as $field) {
            if (! $request->has($field)) {
                continue;
            }

            // Cast both sides to string for a reliable comparison.
            $incoming = (string) $request->input($field);
            $stored   = match ($field) {
                'tracking_type' => $activity->tracking_type->value,
                'is_required'   => $activity->is_required ? '1' : '0',
                default         => (string) $activity->{$field},
            };

            // Normalise boolean-like values the client might send.
            if ($field === 'is_required') {
                $incoming = filter_var($request->input($field), FILTER_VALIDATE_BOOLEAN) ? '1' : '0';
            }

            if ($incoming !== $stored) {
                abort(response()->json([
                    'message' => 'Activities can no longer be changed because this track has started.',
                    'code'    => 'activities_locked',
                ], 409));
            }
        }
    }

    /**
     * Apply per-type server-side rules:
     * - checkbox: target forced to 1, unit set to null.
     * - duration: unit forced to 'minutes'.
     * - count: unit kept as-is.
     */
    private function normalizeData(array $data): array
    {
        $type = TrackingType::tryFrom($data['tracking_type'] ?? '');

        if ($type === TrackingType::Checkbox) {
            $data['daily_target'] = 1;
            $data['unit']         = null;
        } elseif ($type === TrackingType::Duration) {
            $data['unit'] = 'minutes';
        }

        return $data;
    }

    private function format(Activity $activity): array
    {
        return [
            'id'            => $activity->id,
            'track_id'      => $activity->track_id,
            'name'          => $activity->name,
            'description'   => $activity->description,
            'tracking_type' => $activity->tracking_type->value,
            'daily_target'  => $activity->daily_target,
            'unit'          => $activity->unit,
            'is_required'   => $activity->is_required,
            'created_at'    => $activity->created_at,
            'updated_at'    => $activity->updated_at,
        ];
    }
}
