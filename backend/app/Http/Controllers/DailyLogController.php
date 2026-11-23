<?php

namespace App\Http\Controllers;

use App\Http\Requests\DailyLogHistoryRequest;
use App\Http\Requests\StoreDailyLogRequest;
use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use App\Services\TrackProgressService;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DailyLogController extends Controller
{
    public function __construct(private TrackProgressService $service) {}

    /**
     * GET /tracks/{track}/daily-logs?date=YYYY-MM-DD
     *
     * Returns all activities for the track with their progress for the given date.
     * Activities without a log are included with null progress fields.
     */
    public function overview(Request $request, Track $track): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        $date = $request->query('date');

        if (! $date || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json([
                'message' => 'The date field is required and must be in YYYY-MM-DD format.',
                'errors'  => ['date' => ['The date field is required and must be in YYYY-MM-DD format.']],
            ], 422);
        }

        // Eager-load each activity's log for this specific date only.
        $track->load(['activities.dailyLogs' => function ($query) use ($date) {
            $query->whereDate('log_date', $date);
        }]);

        $entries = $track->activities->map(function (Activity $activity) use ($date) {
            $log = $activity->dailyLogs->first();
            return $this->formatOverviewEntry($activity, $log);
        });

        return response()->json($entries);
    }

    /**
     * GET /tracks/{track}/activities/{activity}/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
     *
     * Returns the activity's log history for the requested date range.
     */
    public function history(DailyLogHistoryRequest $request, Track $track, Activity $activity): JsonResponse
    {
        // Ownership already verified in DailyLogHistoryRequest::authorize().
        $logs = $activity->dailyLogs()
            ->whereDate('log_date', '>=', $request->input('from'))
            ->whereDate('log_date', '<=', $request->input('to'))
            ->orderBy('log_date')
            ->get()
            ->map(fn (DailyLog $log) => $this->formatLog($activity, $log));

        return response()->json($logs);
    }

    /**
     * PUT /tracks/{track}/activities/{activity}/logs/{date}
     *
     * Upsert: create a new log or update the existing one for the given date.
     */
    public function upsert(StoreDailyLogRequest $request, Track $track, Activity $activity, string $date): JsonResponse
    {
        // Ownership already verified in StoreDailyLogRequest::authorize().
        // Activity-belongs-to-track, date format, and window checks:
        $error = $this->validateDateParam($request, $track, $activity, $date);
        if ($error) {
            return $error;
        }

        $data = array_filter([
            'value'        => $request->input('value'),
            'is_completed' => $request->input('is_completed'),
        ], fn ($v) => $v !== null && $v !== '');

        // is_completed = false is falsy but valid — preserve it explicitly.
        if ($request->has('is_completed')) {
            $data['is_completed'] = (bool) $request->input('is_completed');
        }

        // Trim notes; store empty string as null.
        if ($request->has('notes')) {
            $trimmed       = trim((string) $request->input('notes'));
            $data['notes'] = $trimmed === '' ? null : $trimmed;
        }

        [$log, $created] = $this->performUpsert($activity, $date, $data);

        return response()->json($this->formatLog($activity, $log), $created ? 201 : 200);
    }

    /**
     * GET /tracks/{track}/activities/{activity}/logs/{date}
     *
     * Return the single log for this activity on this date (404 if none).
     */
    public function show(Request $request, Track $track, Activity $activity, string $date): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        $error = $this->validateDateParam($request, $track, $activity, $date);
        if ($error) {
            return $error;
        }

        $log = DailyLog::where('activity_id', $activity->id)
            ->whereDate('log_date', $date)
            ->firstOrFail();

        return response()->json($this->formatLog($activity, $log));
    }

    /**
     * DELETE /tracks/{track}/activities/{activity}/logs/{date}
     *
     * Delete the log for this activity on this date (404 if none).
     */
    public function destroy(Request $request, Track $track, Activity $activity, string $date): JsonResponse
    {
        $this->authorizeTrack($request, $track);

        $error = $this->validateDateParam($request, $track, $activity, $date);
        if ($error) {
            return $error;
        }

        $log = DailyLog::where('activity_id', $activity->id)
            ->whereDate('log_date', $date)
            ->firstOrFail();

        $log->delete();

        return response()->json(null, 204);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function authorizeTrack(Request $request, Track $track): void
    {
        abort_if($track->user_id !== $request->user()->id, 403);
    }

    /**
     * Shared check order for all {date}-keyed routes:
     *   1. activity belongs to track (404)
     *   2. date is YYYY-MM-DD and a real calendar date (422 errors.log_date)
     *   3. date is within the loggable window (422 code log_date_out_of_range)
     *
     * Ownership must already be verified by the caller before this is invoked.
     * Returns a JsonResponse on failure, null on success.
     */
    private function validateDateParam(Request $request, Track $track, Activity $activity, string $date): ?JsonResponse
    {
        // 1. Activity belongs to track.
        if ($activity->track_id !== $track->id) {
            return response()->json(['message' => 'Not Found.'], 404);
        }

        // 2. Format + real calendar date.
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || ! strtotime($date)
            || date('Y-m-d', strtotime($date)) !== $date) {
            return response()->json([
                'message' => 'The date must be a valid date in YYYY-MM-DD format.',
                'errors'  => ['log_date' => ['The date must be a valid date in YYYY-MM-DD format.']],
            ], 422);
        }

        // 3. Date window.
        $timezone  = $request->user()->timezone ?? 'UTC';
        $today     = Carbon::now($timezone)->toDateString();
        $start     = $track->start_date->toDateString();
        $end       = $track->end_date;
        $windowEnd = $today < $end ? $today : $end;

        if ($date < $start || $date > $windowEnd) {
            return response()->json([
                'message' => 'The log date is outside the allowed window for this track.',
                'code'    => 'log_date_out_of_range',
                'errors'  => ['log_date' => ['The log date is outside the allowed window for this track.']],
            ], 422);
        }

        return null;
    }

    /**
     * Perform the upsert and return [$log, $wasCreated].
     *
     * Concurrency safety on PostgreSQL:
     * updateOrCreate does SELECT then INSERT-or-UPDATE (two statements).
     * Under two simultaneous requests both SELECTs can return null, then
     * both attempt INSERT. The second INSERT hits the unique constraint and
     * PostgreSQL raises an error that also aborts the surrounding transaction,
     * making any further SQL in that connection fail until the transaction ends.
     * We catch UniqueConstraintViolationException — at that point Laravel has
     * already rolled back the failed transaction — then issue a fresh UPDATE
     * in a new clean transaction. This returns the updated row with
     * $wasCreated = false (200), never a 500.
     */
    private function performUpsert(Activity $activity, string $date, array $data): array
    {
        $existing = DailyLog::where('activity_id', $activity->id)
            ->whereDate('log_date', $date)
            ->first();

        try {
            $log = DailyLog::updateOrCreate(
                ['activity_id' => $activity->id, 'log_date' => $date],
                $data,
            );

            return [$log, $existing === null];
        } catch (UniqueConstraintViolationException) {
            // A concurrent request inserted the row between our SELECT and INSERT.
            // The failed transaction is already rolled back by Laravel/PDO.
            // Issue a fresh UPDATE in a new transaction.
            DailyLog::where('activity_id', $activity->id)
                ->whereDate('log_date', $date)
                ->update($data);

            $log = DailyLog::where('activity_id', $activity->id)
                ->whereDate('log_date', $date)
                ->first();

            return [$log, false]; // always 200 — the row already existed
        }
    }

    /**
     * Delegate to TrackProgressService and map keys to the Feature 4 response shape.
     * Existing tests assert: actual_value, is_completed, target_met, progress_percentage.
     */
    private function calculateProgress(Activity $activity, ?DailyLog $log): array
    {
        $p = $this->service->activityProgress($activity, $log);

        $isCheckbox  = $activity->tracking_type->value === 'checkbox';
        $hasNoLog    = $log === null;

        return [
            'actual_value'        => $hasNoLog ? null : ($isCheckbox ? null : $p['actual']),
            'is_completed'        => $hasNoLog ? null : ($isCheckbox ? $p['is_completed'] : null),
            'target_met'          => $p['is_completed'],
            'progress_percentage' => $hasNoLog ? 0 : (int) $p['percentage'],
        ];
    }

    private function formatOverviewEntry(Activity $activity, ?DailyLog $log): array
    {
        $progress = $this->calculateProgress($activity, $log);

        return [
            'activity_id'        => $activity->id,
            'name'               => $activity->name,
            'description'        => $activity->description,
            'tracking_type'      => $activity->tracking_type->value,
            'daily_target'       => $activity->daily_target,
            'unit'               => $activity->unit,
            'is_required'        => $activity->is_required,
            'log_id'             => $log?->id,
            'log_date'           => $log?->log_date,
            ...$progress,
        ];
    }

    private function formatLog(Activity $activity, DailyLog $log): array
    {
        $progress = $this->calculateProgress($activity, $log);

        return [
            'id'                 => $log->id,
            'activity_id'        => $activity->id,
            'log_date'           => $log->log_date,
            'daily_target'       => $activity->daily_target,
            'unit'               => $activity->unit,
            'notes'              => $log->notes,
            ...$progress,
            'created_at'         => $log->created_at,
            'updated_at'         => $log->updated_at,
        ];
    }
}
