<?php

namespace Tests\Unit;

use App\Enums\TrackingType;
use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use App\Models\User;
use App\Services\TrackProgressService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackProgressServiceTest extends TestCase
{
    use RefreshDatabase;

    private TrackProgressService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new TrackProgressService();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();   // unfreeze after each test
        parent::tearDown();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function makeActivity(array $attrs = []): Activity
    {
        return Activity::factory()->create(array_merge([
            'tracking_type' => TrackingType::Count->value,
            'daily_target'  => 10,
            'unit'          => 'reps',
            'is_required'   => true,
        ], $attrs));
    }

    private function makeLog(Activity $activity, array $attrs = []): DailyLog
    {
        return DailyLog::factory()->create(array_merge([
            'activity_id' => $activity->id,
            'log_date'    => Carbon::today('UTC')->toDateString(),
        ], $attrs));
    }

    // ── A. activityProgress ───────────────────────────────────────────────────

    public function test_count_activity_no_log_returns_zero(): void
    {
        $activity = $this->makeActivity(['daily_target' => 10]);
        $result   = $this->service->activityProgress($activity, null);

        $this->assertSame(0, $result['actual']);
        $this->assertSame(10, $result['target']);
        $this->assertSame(0.0, $result['percentage']);
        $this->assertFalse($result['is_completed']);
    }

    public function test_count_activity_partial_progress(): void
    {
        $activity = $this->makeActivity(['daily_target' => 10]);
        $log      = $this->makeLog($activity, ['value' => 7]);
        $result   = $this->service->activityProgress($activity, $log);

        $this->assertSame(7, $result['actual']);
        $this->assertSame(70.0, $result['percentage']);
        $this->assertFalse($result['is_completed']);
    }

    public function test_count_activity_exactly_at_target(): void
    {
        $activity = $this->makeActivity(['daily_target' => 10]);
        $log      = $this->makeLog($activity, ['value' => 10]);
        $result   = $this->service->activityProgress($activity, $log);

        $this->assertSame(100.0, $result['percentage']);
        $this->assertTrue($result['is_completed']);
    }

    public function test_percentage_is_capped_at_100_when_exceeding_target(): void
    {
        $activity = $this->makeActivity(['daily_target' => 5]);
        $log      = $this->makeLog($activity, ['value' => 10]);
        $result   = $this->service->activityProgress($activity, $log);

        // 10/5 = 200% raw, but capped to 100.0
        $this->assertSame(100.0, $result['percentage']);
        // Raw actual is preserved
        $this->assertSame(10, $result['actual']);
        $this->assertTrue($result['is_completed']);
    }

    public function test_checkbox_completed_log(): void
    {
        $activity = $this->makeActivity([
            'tracking_type' => TrackingType::Checkbox->value,
            'daily_target'  => 1,
            'unit'          => null,
        ]);
        $log = $this->makeLog($activity, ['value' => null, 'is_completed' => true]);

        $result = $this->service->activityProgress($activity, $log);

        $this->assertSame(1, $result['actual']);
        $this->assertSame(1, $result['target']);
        $this->assertSame(100.0, $result['percentage']);
        $this->assertTrue($result['is_completed']);
    }

    public function test_checkbox_not_completed_log(): void
    {
        $activity = $this->makeActivity([
            'tracking_type' => TrackingType::Checkbox->value,
            'daily_target'  => 1,
            'unit'          => null,
        ]);
        $log = $this->makeLog($activity, ['value' => null, 'is_completed' => false]);

        $result = $this->service->activityProgress($activity, $log);

        $this->assertSame(0, $result['actual']);
        $this->assertSame(0.0, $result['percentage']);
        $this->assertFalse($result['is_completed']);
    }

    public function test_checkbox_null_log_returns_zero(): void
    {
        $activity = $this->makeActivity([
            'tracking_type' => TrackingType::Checkbox->value,
            'daily_target'  => 1,
            'unit'          => null,
        ]);

        $result = $this->service->activityProgress($activity, null);

        $this->assertSame(0, $result['actual']);
        $this->assertSame(0.0, $result['percentage']);
        $this->assertFalse($result['is_completed']);
    }

    public function test_duration_activity_percentage_calculation(): void
    {
        $activity = $this->makeActivity([
            'tracking_type' => TrackingType::Duration->value,
            'daily_target'  => 30,
            'unit'          => 'minutes',
        ]);
        $log = $this->makeLog($activity, ['value' => 45]);

        $result = $this->service->activityProgress($activity, $log);

        // 45/30 = 150% raw → capped to 100.0
        $this->assertSame(100.0, $result['percentage']);
        $this->assertSame(45, $result['actual']);
        $this->assertTrue($result['is_completed']);
    }

    // ── B. dayProgress ────────────────────────────────────────────────────────

    public function test_day_status_upcoming_when_date_before_track_start(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track = Track::factory()->create([
            'start_date'    => '2026-06-20',
            'duration_days' => 10,
        ]);

        $result = $this->service->dayProgress($track, '2026-06-19', 'UTC', [], []);

        $this->assertSame('upcoming', $result['day_status']);
        $this->assertSame(0.0, $result['completion_percentage']);
    }

    public function test_day_status_pending_when_today_with_no_logs(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id]);

        $result = $this->service->dayProgress(
            $track, '2026-06-15', 'UTC', [$activity], [$activity->id => null]
        );

        $this->assertSame('pending', $result['day_status']);
        $this->assertSame(0.0, $result['completion_percentage']);
    }

    public function test_day_status_missed_when_past_date_with_no_logs(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id]);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC', [$activity], [$activity->id => null]
        );

        $this->assertSame('missed', $result['day_status']);
    }

    public function test_day_status_partial_when_some_progress(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10]);
        $log      = $this->makeLog($activity, ['value' => 5, 'log_date' => '2026-06-12']);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC', [$activity], [$activity->id => $log]
        );

        $this->assertSame('partial', $result['day_status']);
        $this->assertSame(50.0, $result['completion_percentage']);
    }

    public function test_day_status_completed_when_all_required_done(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $required = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 5, 'is_required' => true]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 5, 'is_required' => false]);

        $reqLog = $this->makeLog($required, ['value' => 5, 'log_date' => '2026-06-12']);
        // optional has no log — but required is done, so day is completed

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC',
            [$required, $optional],
            [$required->id => $reqLog, $optional->id => null]
        );

        $this->assertSame('completed', $result['day_status']);
    }

    public function test_day_completion_percentage_uses_only_required_activities(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $required = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);

        $reqLog = $this->makeLog($required, ['value' => 10, 'log_date' => '2026-06-12']);
        $optLog = $this->makeLog($optional, ['value' => 0,  'log_date' => '2026-06-12']);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC',
            [$required, $optional],
            [$required->id => $reqLog, $optional->id => $optLog]
        );

        // Only required activity (100%) counts for completion percentage.
        $this->assertSame(100.0, $result['completion_percentage']);
        $this->assertSame('completed', $result['day_status']);
    }

    public function test_day_with_only_optional_activities_uses_all_for_percentage(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);
        $log      = $this->makeLog($optional, ['value' => 5, 'log_date' => '2026-06-12']);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC',
            [$optional],
            [$optional->id => $log]
        );

        // Falls back to all activities (the one optional) → 50%
        $this->assertSame(50.0, $result['completion_percentage']);
    }

    public function test_day_with_zero_activities_returns_zero_percentage(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $result = $this->service->dayProgress($track, '2026-06-12', 'UTC', [], []);

        $this->assertSame(0.0, $result['completion_percentage']);
        // No activities → no_activities status (not missed)
        $this->assertSame('no_activities', $result['day_status']);
    }

    // ── C. trackSummary ───────────────────────────────────────────────────────

    public function test_upcoming_track_summary_has_zero_elapsed_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user  = User::factory()->create(['timezone' => 'UTC']);
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-20',
            'duration_days' => 10,
        ]);

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame('upcoming', $summary['status']);
        $this->assertSame(0, $summary['elapsed_days']);
        $this->assertSame(10, $summary['days_remaining']);
        $this->assertSame(0, $summary['completed_days']);
        $this->assertSame(0.0, $summary['overall_percentage']);
        $this->assertNull($summary['today']);
    }

    public function test_active_track_summary_counts_elapsed_days_correctly(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user  = User::factory()->create(['timezone' => 'UTC']);
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',   // 6 days ago → elapsed = 6
            'duration_days' => 30,
        ]);

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame('active', $summary['status']);
        $this->assertSame(6, $summary['elapsed_days']);
        $this->assertSame(24, $summary['days_remaining']);
        $this->assertNotNull($summary['today']);
        $this->assertSame('2026-06-15', $summary['today']['date']);
    }

    public function test_expired_track_summary_has_full_elapsed_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user  = User::factory()->create(['timezone' => 'UTC']);
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-05-01',
            'duration_days' => 10,   // ended 2026-05-10
        ]);

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame('expired', $summary['status']);
        $this->assertSame(10, $summary['elapsed_days']);
        $this->assertSame(0, $summary['days_remaining']);
        $this->assertNull($summary['today']);
    }

    public function test_completed_days_counted_correctly(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user     = User::factory()->create(['timezone' => 'UTC']);
        $track    = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 5]);

        // Log 3 completed days out of 6 elapsed.
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 5]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-12', 'value' => 3]);
        // 2026-06-13, 14, 15 have no logs

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame(2, $summary['completed_days']);
    }

    public function test_overall_percentage_is_average_of_daily_percentages(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        $user     = User::factory()->create(['timezone' => 'UTC']);
        $track    = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',   // 3 elapsed days: 10, 11, 12
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10]);

        // Day 1: 10/10 = 100%, Day 2: 5/10 = 50%, Day 3 (today): 0/10 = 0%
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);

        $summary = $this->service->trackSummary($track, 'UTC');

        // (100 + 50 + 0) / 3 = 50.0
        $this->assertSame(50.0, $summary['overall_percentage']);
    }

    public function test_schedule_percentage_is_completed_days_over_total(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        $user     = User::factory()->create(['timezone' => 'UTC']);
        $track    = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 10,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 5]);

        // 1 completed day out of 10 total
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 5]);

        $summary = $this->service->trackSummary($track, 'UTC');

        // 1/10 = 10.0%
        $this->assertSame(10.0, $summary['schedule_percentage']);
    }

    public function test_activities_summary_aggregates_correctly(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        $user     = User::factory()->create(['timezone' => 'UTC']);
        $track    = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10]);

        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);

        $summary     = $this->service->trackSummary($track, 'UTC');
        $actSummary  = $summary['activities_summary'][0];

        $this->assertSame(1, $actSummary['days_completed']);   // only day 1 hit target
        $this->assertSame(15, $actSummary['total_logged']);    // 10 + 5
        // (100 + 50 + 0) / 3 = 50.0
        $this->assertSame(50.0, $actSummary['average_daily_percentage']);
    }

    public function test_track_with_no_activities_does_not_divide_by_zero(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user  = User::factory()->create(['timezone' => 'UTC']);
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame(0.0, $summary['overall_percentage']);
        $this->assertSame(0, $summary['completed_days']);
        $this->assertSame([], $summary['activities_summary']);
    }

    // ── D. no_activities status ───────────────────────────────────────────────

    public function test_no_activities_date_before_start_is_upcoming_not_no_activities(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track = Track::factory()->create([
            'start_date'    => '2026-06-20',
            'duration_days' => 10,
        ]);

        // upcoming check fires before no_activities check
        $result = $this->service->dayProgress($track, '2026-06-19', 'UTC', [], []);

        $this->assertSame('upcoming', $result['day_status']);
    }

    public function test_no_activities_past_day_is_no_activities(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $result = $this->service->dayProgress($track, '2026-06-12', 'UTC', [], []);

        $this->assertSame('no_activities', $result['day_status']);
        $this->assertSame(0.0, $result['completion_percentage']);
    }

    public function test_no_activities_today_is_no_activities(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $result = $this->service->dayProgress($track, '2026-06-15', 'UTC', [], []);

        $this->assertSame('no_activities', $result['day_status']);
    }

    // ── E. partial rule: pool progress only ──────────────────────────────────

    public function test_optional_progress_alone_does_not_make_day_partial_past(): void
    {
        // Required activity has 0%, optional has 50%. Past day.
        // Pool = required only → pool progress = 0 → missed, not partial.
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $required = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);
        $optLog   = $this->makeLog($optional, ['value' => 5, 'log_date' => '2026-06-12']);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC',
            [$required, $optional],
            [$required->id => null, $optional->id => $optLog]
        );

        $this->assertSame('missed', $result['day_status']);
    }

    public function test_optional_progress_alone_does_not_make_day_partial_today(): void
    {
        // Required activity has 0%, optional has 50%. Today.
        // Pool = required only → pool progress = 0 → pending, not partial.
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $required = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);
        $optLog   = $this->makeLog($optional, ['value' => 5, 'log_date' => '2026-06-15']);

        $result = $this->service->dayProgress(
            $track, '2026-06-15', 'UTC',
            [$required, $optional],
            [$required->id => null, $optional->id => $optLog]
        );

        $this->assertSame('pending', $result['day_status']);
    }

    // ── F. optional-only, zero logs ───────────────────────────────────────────

    public function test_optional_only_zero_logs_past_day_is_missed(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);

        $result = $this->service->dayProgress(
            $track, '2026-06-12', 'UTC',
            [$optional],
            [$optional->id => null]
        );

        $this->assertSame('missed', $result['day_status']);
    }

    public function test_optional_only_zero_logs_today_is_pending(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $track    = Track::factory()->create([
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $optional = $this->makeActivity(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => false]);

        $result = $this->service->dayProgress(
            $track, '2026-06-15', 'UTC',
            [$optional],
            [$optional->id => null]
        );

        $this->assertSame('pending', $result['day_status']);
    }

    // ── G. trackSummary: empty track running for several days ─────────────────

    public function test_empty_track_running_several_days_has_no_completed_days(): void
    {
        // Track started 5 days ago, no activities. Every elapsed day is
        // no_activities → none count as completed, partial, or missed.
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        $user  = User::factory()->create(['timezone' => 'UTC']);
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $summary = $this->service->trackSummary($track, 'UTC');

        $this->assertSame('active', $summary['status']);
        $this->assertSame(6, $summary['elapsed_days']);
        $this->assertSame(0, $summary['completed_days']);
        $this->assertSame(0.0, $summary['overall_percentage']);
        $this->assertSame([], $summary['activities_summary']);
        // today breakdown exists but has no_activities status
        $this->assertNotNull($summary['today']);
        $this->assertSame('no_activities', $summary['today']['day_status']);
    }
}
