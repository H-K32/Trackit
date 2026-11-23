<?php

namespace App\Services;

use App\Enums\TrackingType;
use App\Enums\TrackStatus;
use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use Carbon\Carbon;
use Carbon\CarbonPeriod;

class TrackProgressService
{
    // ── A. Single activity progress ───────────────────────────────────────────

    /**
     * Calculate progress for one activity on one day.
     *
     * Returns:
     *   actual       – the raw logged value (int for count/duration, 0/1 for checkbox)
     *   target       – activity's daily_target
     *   percentage   – float 0–100, capped (so 10/5 = 100.0, not 200.0)
     *   is_completed – bool: did the activity meet its target?
     *
     * When $log is null the activity has no recorded progress for that date.
     */
    public function activityProgress(Activity $activity, ?DailyLog $log): array
    {
        $type   = $activity->tracking_type;
        $target = $activity->daily_target;

        if ($type === TrackingType::Checkbox) {
            $actual      = ($log && $log->is_completed) ? 1 : 0;
            $isCompleted = $actual === 1;
            return [
                'actual'       => $actual,
                'target'       => 1,
                'percentage'   => $isCompleted ? 100.0 : 0.0,
                'is_completed' => $isCompleted,
            ];
        }

        // Count and Duration: numeric value.
        $actual      = $log ? ($log->value ?? 0) : 0;
        $isCompleted = $actual >= $target;
        $percentage  = $target > 0
            ? (float) min(100.0, round(($actual / $target) * 100, 1))
            : 0.0;

        return [
            'actual'       => $actual,
            'target'       => $target,
            'percentage'   => $percentage,
            'is_completed' => $isCompleted,
        ];
    }

    // ── B. Single day progress for a track ───────────────────────────────────

    /**
     * Evaluate all activities on a given date.
     *
     * $logsOnDate is a keyed collection: activity_id → DailyLog|null.
     * Pass it pre-loaded to avoid N+1 queries when iterating many days.
     *
     * Day status rules:
     *   upcoming      – date is before track start_date
     *   no_activities – track has no activities (checked after upcoming)
     *   completed     – all activities in the pool have is_completed = true
     *   partial       – at least one pool activity has percentage > 0, but not all completed
     *   missed        – date is strictly before today, zero pool progress
     *   pending       – date is today, zero pool progress (day not over)
     *
     * Pool = required activities when any exist, otherwise all activities.
     * Progress on optional activities alone never makes a day partial when
     * required activities exist.
     */
    public function dayProgress(
        Track $track,
        string $date,
        string $timezone,
        iterable $activities,
        array $logsKeyedByActivityId,
    ): array {
        $tz    = new \DateTimeZone($timezone);
        $today = Carbon::now($tz)->toDateString();
        $start = $track->start_date->toDateString();

        // Date before track starts.
        if ($date < $start) {
            return [
                'day_status'            => 'upcoming',
                'completion_percentage' => 0.0,
                '_raw_pct'              => 0.0,
                'activities'            => [],
            ];
        }

        $activityList = collect($activities);

        // No activities on this track.
        if ($activityList->isEmpty()) {
            return [
                'day_status'            => 'no_activities',
                'completion_percentage' => 0.0,
                '_raw_pct'              => 0.0,
                'activities'            => [],
            ];
        }

        $perActivity  = $activityList->map(function (Activity $activity) use ($logsKeyedByActivityId) {
            $log      = $logsKeyedByActivityId[$activity->id] ?? null;
            $progress = $this->activityProgress($activity, $log);
            return [
                'activity_id'   => $activity->id,
                'name'          => $activity->name,
                'tracking_type' => $activity->tracking_type->value,
                'unit'          => $activity->unit,
                'daily_target'  => $activity->daily_target,
                'is_required'   => $activity->is_required,
                ...$progress,
            ];
        })->values()->all();

        // Determine which activities to use for the day completion percentage.
        $required = array_filter($perActivity, fn ($a) => $a['is_required']);
        $pool     = count($required) > 0 ? $required : $perActivity;

        $rawCompletionPercentage = count($pool) > 0
            ? array_sum(array_column($pool, 'percentage')) / count($pool)
            : 0.0;
        $completionPercentage = (float) round($rawCompletionPercentage, 1);

        // Determine day status.
        $anyPoolProgress = count(array_filter($pool, fn ($a) => $a['percentage'] > 0)) > 0;
        $allRequiredDone = count($pool) > 0 && count(array_filter($pool, fn ($a) => ! $a['is_completed'])) === 0;

        if ($allRequiredDone) {
            $status = 'completed';
        } elseif ($anyPoolProgress) {
            $status = 'partial';
        } elseif ($date < $today) {
            $status = 'missed';
        } else {
            // date === today (future dates are not valid log dates per Feature 4 validation)
            $status = 'pending';
        }

        return [
            'day_status'            => $status,
            'completion_percentage' => $completionPercentage,
            '_raw_pct'              => $rawCompletionPercentage,
            'activities'            => $perActivity,
        ];
    }

    // ── C. Overall track progress summary ────────────────────────────────────

    /**
     * Build the full progress summary for a track.
     *
     * Loads all activities and all daily logs for elapsed days in one query
     * each, then iterates days in PHP — no N+1 queries.
     */
    public function trackSummary(Track $track, string $timezone): array
    {
        $track->loadMissing('activities');

        $trackStatus  = $track->status; // uses existing computed attribute
        $totalDays    = $track->duration_days;
        $startDate    = $track->start_date->toDateString();
        $endDate      = $track->end_date;

        $tz    = new \DateTimeZone($timezone);
        $today = Carbon::now($tz)->toDateString();

        // Elapsed days depend on track status.
        $elapsedDays = match ($trackStatus) {
            'upcoming' => 0,
            'expired'  => $totalDays,
            default    => Carbon::parse($startDate)->diffInDays(Carbon::parse($today)) + 1,
        };

        $daysRemaining = max(0, $totalDays - $elapsedDays);

        // No elapsed days → return early with zeroed summary.
        if ($elapsedDays === 0) {
            return $this->buildSummary(
                track: $track,
                trackStatus: $trackStatus,
                totalDays: $totalDays,
                elapsedDays: 0,
                daysRemaining: $daysRemaining,
                completedDays: 0,
                overallPercentage: 0.0,
                schedulePercentage: 0.0,
                activitiesSummary: $this->emptyActivitiesSummary($track->activities),
                today: null,
                challengeProgress: 0.0,
                milestones: $this->emptyMilestones(),
            );
        }

        // Build the list of elapsed date strings.
        $elapsedEnd    = $trackStatus === 'expired' ? $endDate : $today;
        $elapsedDates  = collect(
            CarbonPeriod::create($startDate, $elapsedEnd)
        )->map(fn (Carbon $d) => $d->toDateString())->all();

        // Load all logs for elapsed days in one query.
        $activityIds = $track->activities->pluck('id')->all();
        $allLogs     = DailyLog::whereIn('activity_id', $activityIds)
            ->whereIn('log_date', $elapsedDates)
            ->get()
            ->groupBy('activity_id');   // Collection keyed by activity_id

        // Iterate elapsed days.
        $completedDays       = 0;
        $dailyPercentages    = [];
        $runningSum          = 0.0;
        $milestoneReachedOn  = [25 => null, 50 => null, 75 => null, 100 => null];
        $activityAccumulator = [];   // activity_id → [days_completed, total_logged, percentages[]]

        foreach ($track->activities as $activity) {
            $activityAccumulator[$activity->id] = [
                'days_completed' => 0,
                'total_logged'   => 0,
                'percentages'    => [],
            ];
        }

        foreach ($elapsedDates as $date) {
            // Build the keyed-by-activity-id log map for this date.
            $logsOnDate = [];
            foreach ($track->activities as $activity) {
                $logsOnDate[$activity->id] = $allLogs->get($activity->id)
                    ?->firstWhere('log_date', $date);
            }

            $day = $this->dayProgress($track, $date, $timezone, $track->activities, $logsOnDate);

            $dailyPercentages[] = $day['completion_percentage'];
            $runningSum += $day['_raw_pct'];

            foreach ($milestoneReachedOn as $threshold => $reachedOn) {
                if ($reachedOn === null && $runningSum >= ($threshold * $totalDays) - 1e-9) {
                    $milestoneReachedOn[$threshold] = $date;
                }
            }

            if ($day['day_status'] === 'completed') {
                $completedDays++;
            }

            // Accumulate per-activity stats.
            foreach ($day['activities'] as $actData) {
                $id  = $actData['activity_id'];
                $acc = &$activityAccumulator[$id];

                $acc['percentages'][] = $actData['percentage'];

                if ($actData['is_completed']) {
                    $acc['days_completed']++;
                }

                // total_logged: for checkbox count completed days; for count/duration sum actual values.
                $activity = $track->activities->firstWhere('id', $id);
                if ($activity->tracking_type === TrackingType::Checkbox) {
                    $acc['total_logged'] += $actData['actual'];
                } else {
                    $acc['total_logged'] += $actData['actual'];
                }
            }
        }

        $overallPercentage = count($dailyPercentages) > 0
            ? (float) round(array_sum($dailyPercentages) / count($dailyPercentages), 1)
            : 0.0;

        $challengeProgress = $totalDays > 0
            ? (float) round(min(100.0, $runningSum / $totalDays), 1)
            : 0.0;

        $milestones = collect([25, 50, 75, 100])->map(function (int $threshold) use ($milestoneReachedOn) {
            $reachedOn = $milestoneReachedOn[$threshold];
            return [
                'threshold'  => $threshold,
                'reached'    => $reachedOn !== null,
                'reached_on' => $reachedOn,
            ];
        })->all();

        $schedulePercentage = $totalDays > 0
            ? (float) round(($completedDays / $totalDays) * 100, 1)
            : 0.0;

        // Build activities_summary.
        $activitiesSummary = $track->activities->map(function (Activity $activity) use ($activityAccumulator) {
            $acc = $activityAccumulator[$activity->id];
            $avgPct = count($acc['percentages']) > 0
                ? (float) round(array_sum($acc['percentages']) / count($acc['percentages']), 1)
                : 0.0;

            return [
                'activity_id'              => $activity->id,
                'name'                     => $activity->name,
                'tracking_type'            => $activity->tracking_type->value,
                'unit'                     => $activity->unit,
                'daily_target'             => $activity->daily_target,
                'is_required'              => $activity->is_required,
                'days_completed'           => $acc['days_completed'],
                'total_logged'             => $acc['total_logged'],
                'average_daily_percentage' => $avgPct,
            ];
        })->values()->all();

        // Today's breakdown (null for upcoming/expired).
        $todayBreakdown = null;
        if ($trackStatus === 'active') {
            $logsToday = [];
            foreach ($track->activities as $activity) {
                $logsToday[$activity->id] = $allLogs->get($activity->id)
                    ?->firstWhere('log_date', $today);
            }
            $dayData        = $this->dayProgress($track, $today, $timezone, $track->activities, $logsToday);
            unset($dayData['_raw_pct']);
            $todayBreakdown = ['date' => $today, ...$dayData];
        }

        return $this->buildSummary(
            track: $track,
            trackStatus: $trackStatus,
            totalDays: $totalDays,
            elapsedDays: $elapsedDays,
            daysRemaining: $daysRemaining,
            completedDays: $completedDays,
            overallPercentage: $overallPercentage,
            schedulePercentage: $schedulePercentage,
            activitiesSummary: $activitiesSummary,
            today: $todayBreakdown,
            challengeProgress: $challengeProgress,
            milestones: $milestones,
        );
    }

    // ── D. Calendar: one entry per day for the whole track ─────────────────

    /**
     * Build the full day-by-day calendar for a track.
     *
     * Query budget: exactly 3 queries regardless of track length.
     *   1. activities (via loadMissing)
     *   2. daily_logs for all days up to today within the track
     *   3. user timezone (via loadMissing on the track's user relation, already
     *      loaded by the controller before this is called)
     *
     * Days after today get day_status = 'upcoming' and activities = [].
     * Days on or before today are evaluated via the existing dayProgress().
     */
    public function calendarDays(Track $track, string $timezone): array
    {
        $track->loadMissing('activities');

        $startDate   = $track->start_date->toDateString();
        $endDate     = $track->end_date;
        $totalDays   = $track->duration_days;
        $trackStatus = $track->status;

        $tz    = new \DateTimeZone($timezone);
        $today = Carbon::now($tz)->toDateString();

        // The loggable window ends at the earlier of today and end_date.
        $windowEnd = $today <= $endDate ? $today : $endDate;

        // Load all logs within the loggable window in one query.
        // For upcoming tracks the window is before start_date, so no logs exist.
        $activityIds = $track->activities->pluck('id')->all();
        $allLogs     = collect();

        if ($activityIds && $startDate <= $windowEnd) {
            $allLogs = DailyLog::whereIn('activity_id', $activityIds)
                ->where('log_date', '>=', $startDate)
                ->where('log_date', '<=', $windowEnd)
                ->get()
                ->groupBy('activity_id');
        }

        // Build one entry per day.
        $days = [];
        $allDates = collect(CarbonPeriod::create($startDate, $endDate))
            ->map(fn (Carbon $d) => $d->toDateString())
            ->all();

        foreach ($allDates as $i => $date) {
            $dayNumber = $i + 1;

            if ($date > $today) {
                // Future day within the track — not yet loggable.
                $days[] = [
                    'day_number'            => $dayNumber,
                    'date'                  => $date,
                    'day_status'            => 'upcoming',
                    'completion_percentage' => 0.0,
                    'activities'            => [],
                ];
                continue;
            }

            // Day is on or before today — evaluate via dayProgress().
            $logsOnDate = [];
            foreach ($track->activities as $activity) {
                $logsOnDate[$activity->id] = $allLogs->get($activity->id)
                    ?->firstWhere('log_date', $date);
            }

            $day = $this->dayProgress($track, $date, $timezone, $track->activities, $logsOnDate);

            $days[] = [
                'day_number'            => $dayNumber,
                'date'                  => $date,
                'day_status'            => $day['day_status'],
                'completion_percentage' => $day['completion_percentage'],
                'activities'            => $this->formatCalendarActivities($day['activities']),
            ];
        }

        // today field: the current date if it falls within the track, else null.
        $todayField = ($today >= $startDate && $today <= $endDate) ? $today : null;

        return [
            'track' => [
                'id'         => $track->id,
                'name'       => $track->name,
                'start_date' => $startDate,
                'end_date'   => $endDate,
                'status'     => $trackStatus,
                'total_days' => $totalDays,
                'today'      => $todayField,
            ],
            'days' => $days,
        ];
    }

    /**
     * Reshape the per-activity array from dayProgress() into the calendar shape:
     *   activity_id, name, tracking_type, target,
     *   value (count/duration) OR is_completed (checkbox), percentage.
     */
    private function formatCalendarActivities(array $activities): array
    {
        return array_map(function (array $a) {
            $isCheckbox = $a['tracking_type'] === 'checkbox';
            $entry = [
                'activity_id'   => $a['activity_id'],
                'name'          => $a['name'],
                'tracking_type' => $a['tracking_type'],
                'unit'          => $a['unit'],
                'target'        => $a['daily_target'],
                'percentage'    => $a['percentage'],
            ];
            if ($isCheckbox) {
                $entry['is_completed'] = $a['is_completed'];
            } else {
                $entry['value'] = $a['actual'];
            }
            return $entry;
        }, $activities);
    }

    // ── E. Analytics ──────────────────────────────────────────────────────────────

    /**
     * Build analytics for a track.
     *
     * overall_completion  – average completion_percentage across all elapsed days
     *                        (0.0 for upcoming tracks with no elapsed days)
     * weekly_breakdown    – weeks numbered from 1, each covering 7 days from
     *                        start_date. Only weeks with at least one elapsed day
     *                        are included. Each week's percentage is the average
     *                        completion_percentage of its elapsed days.
     * activities_performance – per-activity aggregates (same shape as
     *                        activities_summary in trackSummary)
     * trend               – compares the average of the last 7 elapsed days with
     *                        the 7 before that:
     *                          insufficient_data  – fewer than 14 elapsed days
     *                          improving          – diff > +5 percentage points
     *                          declining          – diff < -5 percentage points
     *                          stable             – within ±5 points
     *
     * Query budget: 2 queries (activities + logs), constant regardless of
     * track length or number of activities.
     */
    public function analytics(Track $track, string $timezone): array
    {
        $track->loadMissing('activities');

        $trackStatus = $track->status;
        $startDate   = $track->start_date->toDateString();
        $endDate     = $track->end_date;
        $totalDays   = $track->duration_days;

        $tz    = new \DateTimeZone($timezone);
        $today = Carbon::now($tz)->toDateString();

        // Elapsed dates (empty for upcoming tracks).
        $elapsedEnd = match ($trackStatus) {
            'upcoming' => null,
            'expired'  => $endDate,
            default    => $today,
        };

        if ($elapsedEnd === null) {
            return $this->buildAnalytics(
                track: $track,
                overallCompletion: 0.0,
                weeklyBreakdown: [],
                activitiesPerformance: $this->emptyActivitiesSummary($track->activities),
                trend: 'insufficient_data',
            );
        }

        $elapsedDates = collect(CarbonPeriod::create($startDate, $elapsedEnd))
            ->map(fn (Carbon $d) => $d->toDateString())
            ->all();

        $elapsedCount = count($elapsedDates);

        // Load all logs for elapsed days in one query.
        $activityIds = $track->activities->pluck('id')->all();
        $allLogs     = $activityIds
            ? DailyLog::whereIn('activity_id', $activityIds)
                ->whereIn('log_date', $elapsedDates)
                ->get()
                ->groupBy('activity_id')
            : collect();

        // Iterate elapsed days, accumulating per-day and per-activity data.
        $dailyPercentages    = [];
        $activityAccumulator = [];

        foreach ($track->activities as $activity) {
            $activityAccumulator[$activity->id] = [
                'days_completed' => 0,
                'total_logged'   => 0,
                'percentages'    => [],
            ];
        }

        foreach ($elapsedDates as $date) {
            $logsOnDate = [];
            foreach ($track->activities as $activity) {
                $logsOnDate[$activity->id] = $allLogs->get($activity->id)
                    ?->firstWhere('log_date', $date);
            }

            $day = $this->dayProgress($track, $date, $timezone, $track->activities, $logsOnDate);
            $dailyPercentages[] = $day['completion_percentage'];

            foreach ($day['activities'] as $actData) {
                $id  = $actData['activity_id'];
                $acc = &$activityAccumulator[$id];
                $acc['percentages'][] = $actData['percentage'];
                if ($actData['is_completed']) {
                    $acc['days_completed']++;
                }
                $acc['total_logged'] += $actData['actual'];
            }
        }

        // Overall completion.
        $overallCompletion = $elapsedCount > 0
            ? (float) round(array_sum($dailyPercentages) / $elapsedCount, 1)
            : 0.0;

        // Weekly breakdown: week N covers day-indices [(N-1)*7 .. N*7-1].
        $weeklyBreakdown = [];
        $weekCount       = (int) ceil($totalDays / 7);

        for ($w = 0; $w < $weekCount; $w++) {
            $weekStart = $w * 7;          // 0-based index into all track days
            $weekEnd   = min($weekStart + 6, $totalDays - 1);

            // Collect elapsed day percentages that fall in this week.
            $weekPercentages = [];
            for ($d = $weekStart; $d <= $weekEnd; $d++) {
                if (isset($dailyPercentages[$d])) {
                    $weekPercentages[] = $dailyPercentages[$d];
                }
            }

            if (empty($weekPercentages)) {
                continue; // week has no elapsed days yet
            }

            $weeklyBreakdown[] = [
                'week'       => $w + 1,
                'percentage' => (float) round(array_sum($weekPercentages) / count($weekPercentages), 1),
            ];
        }

        // Trend: last 7 elapsed days vs the 7 before.
        $trend = 'insufficient_data';
        if ($elapsedCount >= 14) {
            $last7  = array_slice($dailyPercentages, -7);
            $prev7  = array_slice($dailyPercentages, -14, 7);
            $avgLast = array_sum($last7) / 7;
            $avgPrev = array_sum($prev7) / 7;
            $diff    = $avgLast - $avgPrev;

            $trend = match (true) {
                $diff > 5  => 'improving',
                $diff < -5 => 'declining',
                default    => 'stable',
            };
        }

        // Activities performance.
        $activitiesPerformance = $track->activities->map(function (Activity $activity) use ($activityAccumulator) {
            $acc    = $activityAccumulator[$activity->id];
            $avgPct = count($acc['percentages']) > 0
                ? (float) round(array_sum($acc['percentages']) / count($acc['percentages']), 1)
                : 0.0;

            return [
                'activity_id'              => $activity->id,
                'name'                     => $activity->name,
                'tracking_type'            => $activity->tracking_type->value,
                'unit'                     => $activity->unit,
                'daily_target'             => $activity->daily_target,
                'is_required'              => $activity->is_required,
                'days_completed'           => $acc['days_completed'],
                'total_logged'             => $acc['total_logged'],
                'average_daily_percentage' => $avgPct,
            ];
        })->values()->all();

        return $this->buildAnalytics(
            track: $track,
            overallCompletion: $overallCompletion,
            weeklyBreakdown: $weeklyBreakdown,
            activitiesPerformance: $activitiesPerformance,
            trend: $trend,
        );
    }

    private function buildAnalytics(
        Track $track,
        float $overallCompletion,
        array $weeklyBreakdown,
        array $activitiesPerformance,
        string $trend,
    ): array {
        return [
            'track_id'               => $track->id,
            'status'                 => $track->status,
            'overall_completion'     => $overallCompletion,
            'weekly_breakdown'       => $weeklyBreakdown,
            'activities_performance' => $activitiesPerformance,
            'trend'                  => $trend,
        ];
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private function buildSummary(
        Track $track,
        string $trackStatus,
        int $totalDays,
        int $elapsedDays,
        int $daysRemaining,
        int $completedDays,
        float $overallPercentage,
        float $schedulePercentage,
        array $activitiesSummary,
        ?array $today,
        float $challengeProgress,
        array $milestones,
    ): array {
        return [
            'track_id'           => $track->id,
            'status'             => $trackStatus,
            'total_days'         => $totalDays,
            'elapsed_days'       => $elapsedDays,
            'days_remaining'     => $daysRemaining,
            'completed_days'     => $completedDays,
            'overall_percentage' => $overallPercentage,
            'challenge_progress' => $challengeProgress,
            'milestones'         => $milestones,
            'schedule_percentage' => $schedulePercentage,
            'today'              => $today,
            'activities_summary' => $activitiesSummary,
        ];
    }

    private function emptyActivitiesSummary($activities): array
    {
        return collect($activities)->map(fn (Activity $a) => [
            'activity_id'              => $a->id,
            'name'                     => $a->name,
            'tracking_type'            => $a->tracking_type->value,
            'unit'                     => $a->unit,
            'daily_target'             => $a->daily_target,
            'is_required'              => $a->is_required,
            'days_completed'           => 0,
            'total_logged'             => 0,
            'average_daily_percentage' => 0.0,
        ])->values()->all();
    }

    private function emptyMilestones(): array
    {
        return collect([25, 50, 75, 100])->map(fn (int $threshold) => [
            'threshold'  => $threshold,
            'reached'    => false,
            'reached_on' => null,
        ])->all();
    }
}
