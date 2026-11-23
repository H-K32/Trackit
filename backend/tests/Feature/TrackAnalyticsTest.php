<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TrackAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function userWithToken(string $timezone = 'UTC'): array
    {
        $user  = User::factory()->create(['timezone' => $timezone]);
        $token = $user->createToken('api')->plainTextToken;
        return [$user, $token];
    }

    private function auth(string $token): array
    {
        return ['Authorization' => "Bearer $token"];
    }

    // ── authentication ────────────────────────────────────────────────────────

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/tracks/1/analytics')->assertStatus(401);
    }

    // ── ownership ─────────────────────────────────────────────────────────────

    public function test_another_user_cannot_view_analytics(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = Track::factory()->active()->create(['user_id' => $owner->id]);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertStatus(403);
    }

    // ── response structure ────────────────────────────────────────────────────

    public function test_response_has_required_top_level_keys(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 14,
        ]);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->assertJsonStructure([
                'track_id',
                'status',
                'overall_completion',
                'weekly_breakdown',
                'activities_performance',
                'trend',
            ]);
    }

    // ── upcoming track ────────────────────────────────────────────────────────

    public function test_upcoming_track_returns_zeroed_analytics(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-20',
            'duration_days' => 14,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $data = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json();

        $this->assertSame('upcoming', $data['status']);
        $this->assertEquals(0.0, $data['overall_completion']);
        $this->assertSame([], $data['weekly_breakdown']);
        $this->assertSame('insufficient_data', $data['trend']);
    }

    // ── expired track ─────────────────────────────────────────────────────────

    public function test_expired_track_returns_full_analytics(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-05-01',
            'duration_days' => 14,   // ended 2026-05-14
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        // All 14 days logged at 100%
        foreach (range(0, 13) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-05-01')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json();

        $this->assertSame('expired', $data['status']);
        $this->assertEquals(100.0, $data['overall_completion']);
        $this->assertCount(2, $data['weekly_breakdown']);
        $this->assertEquals(100.0, $data['weekly_breakdown'][0]['percentage']);
        $this->assertEquals(100.0, $data['weekly_breakdown'][1]['percentage']);
        $this->assertSame('stable', $data['trend']);
    }

    // ── overall_completion ────────────────────────────────────────────────────

    public function test_overall_completion_is_average_of_elapsed_day_percentages(): void
    {
        // 3 elapsed days: 100%, 50%, 0% → average = 50%
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);
        // Jun 12 (today): no log → 0%

        $completion = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('overall_completion');

        $this->assertEquals(50.0, $completion);
    }

    // ── weekly_breakdown ──────────────────────────────────────────────────────

    public function test_weekly_breakdown_week_numbers_start_at_one(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 14,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $weeks = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('weekly_breakdown');

        $this->assertNotEmpty($weeks);
        $this->assertSame(1, $weeks[0]['week']);
    }

    public function test_weekly_breakdown_buckets_days_from_start_date(): void
    {
        // Track starts Jun 10. Week 1 = Jun 10–16 (days 1–7), Week 2 = Jun 17–23 (days 8–14).
        // Freeze at Jun 17 so both weeks have at least one elapsed day.
        Carbon::setTestNow(Carbon::parse('2026-06-17 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 14,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        // Week 1: all 7 days at 100%
        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }
        // Week 2: only Jun 17 (today) elapsed, no log → 0%

        $weeks = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('weekly_breakdown');

        $this->assertCount(2, $weeks);
        $this->assertSame(1, $weeks[0]['week']);
        $this->assertEquals(100.0, $weeks[0]['percentage']);
        $this->assertSame(2, $weeks[1]['week']);
        $this->assertEquals(0.0, $weeks[1]['percentage']);
    }

    public function test_weekly_breakdown_partial_last_week_is_included(): void
    {
        // 10-day track: week 1 = days 1–7, week 2 = days 8–10 (3 days).
        // Freeze at day 10 so all days are elapsed.
        Carbon::setTestNow(Carbon::parse('2026-06-19 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 10,   // ends Jun 19
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $weeks = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('weekly_breakdown');

        $this->assertCount(2, $weeks);
        $this->assertSame(1, $weeks[0]['week']);
        $this->assertSame(2, $weeks[1]['week']);
    }

    public function test_future_weeks_are_omitted_from_breakdown(): void
    {
        // 14-day track, only 3 days elapsed → only week 1 appears.
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 14,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $weeks = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('weekly_breakdown');

        // Only week 1 has elapsed days (Jun 10–12); week 2 (Jun 17–23) has none yet.
        $this->assertCount(1, $weeks);
        $this->assertSame(1, $weeks[0]['week']);
    }

    // ── activities_performance ────────────────────────────────────────────────

    public function test_activities_performance_structure(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $perf = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('activities_performance');

        $this->assertCount(1, $perf);
        $this->assertArrayHasKey('activity_id',              $perf[0]);
        $this->assertArrayHasKey('days_completed',           $perf[0]);
        $this->assertArrayHasKey('total_logged',             $perf[0]);
        $this->assertArrayHasKey('average_daily_percentage', $perf[0]);
    }

    public function test_activities_performance_aggregates_correctly(): void
    {
        // 3 elapsed days: 10, 5, 0 logged against target 10.
        Carbon::setTestNow(Carbon::parse('2026-06-12 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);
        // Jun 12 (today): no log → 0%

        $perf = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('activities_performance.0');

        $this->assertSame(1, $perf['days_completed']);           // only Jun 10 hit target
        $this->assertSame(15, $perf['total_logged']);            // 10 + 5
        $this->assertEquals(50.0, $perf['average_daily_percentage']); // (100+50+0)/3
    }

    // ── trend ─────────────────────────────────────────────────────────────────

    public function test_trend_is_insufficient_data_under_14_elapsed_days(): void
    {
        // 13 elapsed days (Jun 10 through Jun 22 = 13 days).
        Carbon::setTestNow(Carbon::parse('2026-06-22 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $trend = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('trend');

        $this->assertSame('insufficient_data', $trend);
    }

    public function test_trend_is_stable_when_difference_within_5_points(): void
    {
        // 14 elapsed days. All at 50% → last 7 avg = prev 7 avg = 50 → diff = 0 → stable.
        Carbon::setTestNow(Carbon::parse('2026-06-23 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        foreach (range(0, 13) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 5,
            ]);
        }

        $trend = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('trend');

        $this->assertSame('stable', $trend);
    }

    public function test_trend_is_improving_when_last_7_more_than_5_points_above_prev_7(): void
    {
        // Days 1–7 (Jun 10–16): no logs → 0%. Days 8–14 (Jun 17–23): 100%. diff = +100 → improving.
        Carbon::setTestNow(Carbon::parse('2026-06-23 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-17')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }

        $trend = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('trend');

        $this->assertSame('improving', $trend);
    }

    public function test_trend_is_declining_when_last_7_more_than_5_points_below_prev_7(): void
    {
        // Days 1–7 (Jun 10–16): 100%. Days 8–14 (Jun 17–23): no logs → 0%. diff = -100 → declining.
        Carbon::setTestNow(Carbon::parse('2026-06-23 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }

        $trend = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('trend');

        $this->assertSame('declining', $trend);
    }

    public function test_trend_stable_at_exactly_5_point_boundary(): void
    {
        // prev 7 avg = 50%, last 7 avg = 55% → diff = +5 → stable (not strictly > 5).
        Carbon::setTestNow(Carbon::parse('2026-06-23 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 100,
            'is_required'  => true,
        ]);

        // Days 1–7: value=50 → 50% each
        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 50,
            ]);
        }
        // Days 8–14: value=55 → 55% each
        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-17')->addDays($d)->toDateString(),
                'value'       => 55,
            ]);
        }

        $trend = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json('trend');

        $this->assertSame('stable', $trend);
    }

    // ── timezone ──────────────────────────────────────────────────────────────

    public function test_timezone_utc_plus_14_sees_7_elapsed_days_in_week_1(): void
    {
        // UTC 2026-06-15 23:30 → Pacific/Kiritimati (UTC+14) local date = Jun 16.
        // Track starts Jun 10. Elapsed days = Jun 10–16 = 7 days (fills week 1).
        // All 7 days logged at 100% → week 1 percentage = 100%.
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Pacific/Kiritimati');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);
        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json();

        // 7 elapsed days all at 100% → overall = 100%, week 1 = 100%.
        $this->assertEquals(100.0, $data['overall_completion']);
        $this->assertCount(1, $data['weekly_breakdown']);
        $this->assertEquals(100.0, $data['weekly_breakdown'][0]['percentage']);
    }

    public function test_timezone_utc_sees_only_6_elapsed_days_at_same_moment(): void
    {
        // Same frozen clock: UTC 2026-06-15 23:30 → UTC local date = Jun 15.
        // Track starts Jun 10. Elapsed days = Jun 10–15 = 6 days.
        // Jun 16 is NOT elapsed yet for a UTC user.
        // Logs exist for Jun 10–16 but Jun 16 is outside the elapsed window.
        // All 6 elapsed days have logs at 100% → overall = 100%.
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);
        // Log Jun 10–16 — but Jun 16 is future for UTC user so only 6 days count.
        foreach (range(0, 6) as $d) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date'    => Carbon::parse('2026-06-10')->addDays($d)->toDateString(),
                'value'       => 10,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/analytics")
            ->assertOk()
            ->json();

        // 6 elapsed days (Jun 16 excluded) all at 100% → overall = 100%.
        $this->assertEquals(100.0, $data['overall_completion']);
        $this->assertCount(1, $data['weekly_breakdown']);
        // Week 1 has only 6 days contributing (not 7), but all are 100%.
        $this->assertEquals(100.0, $data['weekly_breakdown'][0]['percentage']);
    }
    // ── constant query count ──────────────────────────────────────────────────

    public function test_query_count_is_constant_regardless_of_track_length(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');

        // Warm up Sanctum token/user cache.
        $warmTrack = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 1,
        ]);
        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$warmTrack->id}/analytics");

        // 10-day track
        $track10 = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-06',
            'duration_days' => 10,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track10->id]);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track10->id}/analytics")
            ->assertOk();
        $count10 = count(DB::getQueryLog());

        // 100-day track
        $track100 = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-03-07',
            'duration_days' => 100,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track100->id]);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track100->id}/analytics")
            ->assertOk();
        $count100 = count(DB::getQueryLog());

        DB::disableQueryLog();

        $this->assertSame($count10, $count100,
            "Query count should be constant: got {$count10} for 10-day and {$count100} for 100-day track"
        );
    }
}
