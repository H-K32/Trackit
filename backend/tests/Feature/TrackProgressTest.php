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

class TrackProgressTest extends TestCase
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
        $this->getJson('/api/tracks/1/progress')->assertStatus(401);
    }

    // ── ownership ─────────────────────────────────────────────────────────────

    public function test_another_user_cannot_view_progress(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = Track::factory()->active()->create(['user_id' => $owner->id]);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertStatus(403);
    }

    // ── upcoming track ────────────────────────────────────────────────────────

    public function test_upcoming_track_returns_correct_structure(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-20',
            'duration_days' => 10,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk()
            ->assertJsonStructure([
                'track_id', 'status', 'total_days', 'elapsed_days',
                'days_remaining', 'completed_days', 'overall_percentage',
                'schedule_percentage', 'today', 'activities_summary',
            ]);

        $data = $response->json();
        $this->assertSame('upcoming', $data['status']);
        $this->assertSame(0, $data['elapsed_days']);
        $this->assertSame(10, $data['days_remaining']);
        $this->assertNull($data['today']);
        $this->assertEquals(0.0, $data['overall_percentage']);
    }

    // ── active track ──────────────────────────────────────────────────────────

    public function test_active_track_returns_today_breakdown(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        $data = $response->json();
        $this->assertSame('active', $data['status']);
        $this->assertSame(6, $data['elapsed_days']);
        $this->assertNotNull($data['today']);
        $this->assertSame('2026-06-15', $data['today']['date']);
    }

    public function test_active_track_with_logs_shows_correct_percentages(): void
    {
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

        // Day 1: 100%, Day 2: 50%, Day 3 (today): 0%
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-11', 'value' => 5]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        $data = $response->json();
        // (100 + 50 + 0) / 3 = 50.0
        $this->assertEquals(50.0, $data['overall_percentage']);
        $this->assertSame(1, $data['completed_days']);
    }

    public function test_today_breakdown_includes_activity_details(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        $today = $response->json('today');
        $this->assertArrayHasKey('activities', $today);
        $this->assertCount(1, $today['activities']);
        $this->assertArrayHasKey('activity_id', $today['activities'][0]);
        $this->assertArrayHasKey('percentage', $today['activities'][0]);
        $this->assertArrayHasKey('is_completed', $today['activities'][0]);
    }

    // ── expired track ─────────────────────────────────────────────────────────

    public function test_expired_track_has_null_today_and_full_elapsed_days(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-05-01',
            'duration_days' => 10,   // ended 2026-05-10
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        $data = $response->json();
        $this->assertSame('expired', $data['status']);
        $this->assertSame(10, $data['elapsed_days']);
        $this->assertSame(0, $data['days_remaining']);
        $this->assertNull($data['today']);
    }

    // ── activities_summary ────────────────────────────────────────────────────

    public function test_activities_summary_structure_is_correct(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        $summary = $response->json('activities_summary');
        $this->assertCount(1, $summary);
        $this->assertArrayHasKey('activity_id', $summary[0]);
        $this->assertArrayHasKey('days_completed', $summary[0]);
        $this->assertArrayHasKey('total_logged', $summary[0]);
        $this->assertArrayHasKey('average_daily_percentage', $summary[0]);
    }

    // ── timezone boundary ─────────────────────────────────────────────────────

    public function test_today_respects_user_timezone(): void
    {
        // UTC time is 2026-06-15 23:30 — still June 15 in UTC.
        // For a user in UTC+2 it is already 2026-06-16 01:30.
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Europe/Paris'); // UTC+2 in summer
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk();

        // For the Paris user today is June 16, not June 15.
        $this->assertSame('2026-06-16', $response->json('today.date'));
    }

    // ── milestones ────────────────────────────────────────────────────────────

    public function test_perfect_day_one_on_100_day_track_reaches_no_milestone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-10 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-10', 'duration_days' => 100]);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-10', 'value' => 10]);

        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertEquals(1.0, $data['challenge_progress']);
        $this->assertEquals(100.0, $data['overall_percentage']);
        foreach ($data['milestones'] as $milestone) {
            $this->assertFalse($milestone['reached']);
            $this->assertNull($milestone['reached_on']);
        }
    }

    public function test_known_daily_values_replay_milestone_dates(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-10 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-01', 'duration_days' => 10]);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        $values = [100, 100, 100, 50, 100, 100, 100, 50, 100, 100];
        foreach ($values as $index => $percentage) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date' => '2026-06-' . str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT),
                'value' => $percentage / 10,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertEquals(90.0, $data['challenge_progress']);
        $this->assertSame([
            ['threshold' => 25, 'reached' => true, 'reached_on' => '2026-06-03'],
            ['threshold' => 50, 'reached' => true, 'reached_on' => '2026-06-06'],
            ['threshold' => 75, 'reached' => true, 'reached_on' => '2026-06-09'],
            ['threshold' => 100, 'reached' => false, 'reached_on' => null],
        ], $data['milestones']);
    }

    public function test_100_milestone_requires_every_track_day_at_100_percent(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-20 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-01', 'duration_days' => 10]);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        for ($day = 1; $day <= 10; $day++) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date' => '2026-06-' . str_pad((string) $day, 2, '0', STR_PAD_LEFT),
                'value' => 10,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertEquals(100.0, $data['challenge_progress']);
        // Hand-calculated: 10-day track, all days 100%. runningSum after day N = N*100.
        // Threshold T% is reached when runningSum >= T * totalDays, i.e. N*100 >= T*10.
        // 25%: N >= 2.5 → day 3 (2026-06-03)
        // 50%: N >= 5   → day 5 (2026-06-05, exact hit: 500 >= 500)
        // 75%: N >= 7.5 → day 8 (2026-06-08)
        // 100%: N >= 10 → day 10 (2026-06-10, exact hit: 1000 >= 1000)
        $this->assertTrue($data['milestones'][0]['reached']);
        $this->assertSame('2026-06-03', $data['milestones'][0]['reached_on']);
        $this->assertTrue($data['milestones'][1]['reached']);
        $this->assertSame('2026-06-05', $data['milestones'][1]['reached_on']);
        $this->assertTrue($data['milestones'][2]['reached']);
        $this->assertSame('2026-06-08', $data['milestones'][2]['reached_on']);
        $this->assertTrue($data['milestones'][3]['reached']);
        $this->assertSame('2026-06-10', $data['milestones'][3]['reached_on']);
    }

    public function test_lowering_or_deleting_a_log_recomputes_milestones(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-20 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-01', 'duration_days' => 10]);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 10, 'is_required' => true]);
        $logs = [];
        for ($day = 1; $day <= 10; $day++) {
            $logs[] = DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date' => '2026-06-' . str_pad((string) $day, 2, '0', STR_PAD_LEFT),
                'value' => 10,
            ]);
        }

        $logs[0]->update(['value' => 5]);
        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertFalse($data['milestones'][3]['reached']);
        $this->assertNull($data['milestones'][3]['reached_on']);

        $logs[0]->update(['value' => 10]);
        $logs[9]->delete();
        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertFalse($data['milestones'][3]['reached']);
        $this->assertEquals(90.0, $data['challenge_progress']);
    }

    public function test_upcoming_expired_and_no_activity_milestones(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');

        $upcoming = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-20', 'duration_days' => 10]);
        $upcomingData = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$upcoming->id}/progress")->assertOk()->json();
        $this->assertEquals(0.0, $upcomingData['challenge_progress']);
        $this->assertFalse($upcomingData['milestones'][0]['reached']);

        $expired = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-05-01', 'duration_days' => 10]);
        $expiredData = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$expired->id}/progress")->assertOk()->json();
        $this->assertEquals(0.0, $expiredData['challenge_progress']);
        $this->assertSame([], $expiredData['activities_summary']);

        $activeNoActivities = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-10', 'duration_days' => 30]);
        $noActivityData = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$activeNoActivities->id}/progress")->assertOk()->json();
        $this->assertEquals(0.0, $noActivityData['challenge_progress']);
        foreach ($noActivityData['milestones'] as $milestone) {
            $this->assertFalse($milestone['reached']);
            $this->assertNull($milestone['reached_on']);
        }
    }

    public function test_milestone_today_uses_track_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));
        [$user, $token] = $this->userWithToken('Europe/Paris');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-15', 'duration_days' => 100]);

        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();
        $this->assertSame('active', $data['status']);
        $this->assertSame('2026-06-16', $data['today']['date']);
        $this->assertEquals(0.0, $data['challenge_progress']);
    }

    public function test_progress_query_count_is_constant_for_track_length(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');

        $warmTrack = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-15', 'duration_days' => 1]);
        $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$warmTrack->id}/progress");

        $track10 = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-06', 'duration_days' => 10]);
        Activity::factory()->count_type()->create(['track_id' => $track10->id]);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track10->id}/progress")->assertOk();
        $count10 = count(DB::getQueryLog());

        $track100 = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-03-08', 'duration_days' => 100]);
        Activity::factory()->count_type()->create(['track_id' => $track100->id]);
        DB::flushQueryLog();
        $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track100->id}/progress")->assertOk();
        $count100 = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame($count10, $count100,
            "Query count should be constant: got {$count10} for 10-day and {$count100} for 100-day track"
        );
    }

    // ── internal key leak guard ───────────────────────────────────────────────

    public function test_internal_raw_pct_key_does_not_appear_in_response(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 10]);

        $data = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/progress")
            ->assertOk()
            ->json();

        $this->assertArrayNotHasKey('raw_completion_percentage', $data['today']);
        $this->assertArrayNotHasKey('_raw_pct', $data['today']);
    }

    public function test_running_sum_can_land_exactly_on_a_threshold(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-04 12:00:00', 'UTC'));
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create(['user_id' => $user->id, 'start_date' => '2026-06-01', 'duration_days' => 4]);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id, 'daily_target' => 4, 'is_required' => true]);

        for ($day = 1; $day <= 4; $day++) {
            DailyLog::factory()->create([
                'activity_id' => $activity->id,
                'log_date' => '2026-06-' . str_pad((string) $day, 2, '0', STR_PAD_LEFT),
                'value' => 4,
            ]);
        }

        $data = $this->withHeaders($this->auth($token))->getJson("/api/tracks/{$track->id}/progress")->assertOk()->json();

        $this->assertEquals(100.0, $data['challenge_progress']);
        $this->assertTrue($data['milestones'][0]['reached']);
        $this->assertSame('2026-06-01', $data['milestones'][0]['reached_on']);
        $this->assertTrue($data['milestones'][1]['reached']);
        $this->assertSame('2026-06-02', $data['milestones'][1]['reached_on']);
        $this->assertTrue($data['milestones'][2]['reached']);
        $this->assertSame('2026-06-03', $data['milestones'][2]['reached_on']);
        $this->assertTrue($data['milestones'][3]['reached']);
        $this->assertSame('2026-06-04', $data['milestones'][3]['reached_on']);
    }
}
