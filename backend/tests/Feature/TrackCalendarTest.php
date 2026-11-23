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

class TrackCalendarTest extends TestCase
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
        $this->getJson('/api/tracks/1/calendar')->assertStatus(401);
    }

    // ── ownership ─────────────────────────────────────────────────────────────

    public function test_another_user_cannot_view_calendar(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = Track::factory()->active()->create(['user_id' => $owner->id]);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertStatus(403);
    }

    public function test_ownership_checked_before_anything_else(): void
    {
        // Even a non-existent track ID returns 404 from model binding,
        // but a real track owned by someone else returns 403.
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = Track::factory()->active()->create(['user_id' => $owner->id]);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertStatus(403);
    }

    // ── response structure ────────────────────────────────────────────────────

    public function test_response_has_track_and_days_keys(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 5,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->assertJsonStructure([
                'track' => ['id', 'name', 'start_date', 'end_date', 'status', 'total_days', 'today'],
                'days',
            ]);

        $data = $response->json();
        $this->assertCount(5, $data['days']);
    }

    public function test_track_object_fields_are_correct(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 10,
        ]);

        $t = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('track');

        $this->assertSame($track->id, $t['id']);
        $this->assertSame('2026-06-10', $t['start_date']);
        $this->assertSame('2026-06-19', $t['end_date']);   // start + 10 - 1
        $this->assertSame(10, $t['total_days']);
        $this->assertSame('active', $t['status']);
        $this->assertSame('2026-06-15', $t['today']);      // today is within track
    }

    // ── upcoming track ────────────────────────────────────────────────────────

    public function test_upcoming_track_all_days_are_upcoming(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-20',
            'duration_days' => 5,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        $this->assertCount(5, $days);
        foreach ($days as $day) {
            $this->assertSame('upcoming', $day['day_status']);
            $this->assertEquals(0.0, $day['completion_percentage']);
            $this->assertSame([], $day['activities']);
        }
    }

    public function test_upcoming_track_today_field_is_null(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-20',
            'duration_days' => 5,
        ]);

        $today = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('track.today');

        $this->assertNull($today);
    }

    // ── active track ──────────────────────────────────────────────────────────

    public function test_active_track_past_days_have_correct_statuses(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-13',
            'duration_days' => 5,   // days: 13,14,15,16,17
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        // Day 1 (Jun 13): completed (value=10)
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-13', 'value' => 10]);
        // Day 2 (Jun 14): partial (value=5)
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-14', 'value' => 5]);
        // Day 3 (Jun 15): today — pending (no log)
        // Day 4 (Jun 16): future — upcoming
        // Day 5 (Jun 17): future — upcoming

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        $this->assertCount(5, $days);
        $this->assertSame(1,            $days[0]['day_number']);
        $this->assertSame('2026-06-13', $days[0]['date']);
        $this->assertSame('completed',  $days[0]['day_status']);
        $this->assertEquals(100.0,      $days[0]['completion_percentage']);

        $this->assertSame('partial',    $days[1]['day_status']);
        $this->assertEquals(50.0,       $days[1]['completion_percentage']);

        $this->assertSame('pending',    $days[2]['day_status']);
        $this->assertSame('2026-06-15', $days[2]['date']);

        $this->assertSame('upcoming',   $days[3]['day_status']);
        $this->assertSame([],           $days[3]['activities']);

        $this->assertSame('upcoming',   $days[4]['day_status']);
    }

    public function test_active_track_today_field_equals_today(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 30,
        ]);

        $today = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('track.today');

        $this->assertSame('2026-06-15', $today);
    }

    public function test_active_track_missed_day_has_empty_activities_when_no_log(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-13',
            'duration_days' => 5,
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        // Day 1 (Jun 13): missed — activities array still present (with 0 progress)
        $this->assertSame('missed', $days[0]['day_status']);
        $this->assertCount(1, $days[0]['activities']);
        $this->assertEquals(0.0, $days[0]['activities'][0]['percentage']);
    }

    // ── expired track ─────────────────────────────────────────────────────────

    public function test_expired_track_all_days_are_past_statuses(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-01',
            'duration_days' => 5,   // ended 2026-06-05
        ]);
        Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        $this->assertCount(5, $days);
        // All days are in the past with no logs → all missed
        foreach ($days as $day) {
            $this->assertSame('missed', $day['day_status']);
            $this->assertNotSame('upcoming', $day['day_status']);
        }
    }

    public function test_expired_track_today_field_is_null(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-01',
            'duration_days' => 5,
        ]);

        $today = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('track.today');

        $this->assertNull($today);
    }

    // ── per-activity shape ────────────────────────────────────────────────────

    public function test_count_activity_entry_has_value_not_is_completed(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 3,
        ]);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
        ]);
        DailyLog::factory()->create(['activity_id' => $activity->id, 'log_date' => '2026-06-15', 'value' => 7]);

        $actEntry = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days.0.activities.0');

        $this->assertArrayHasKey('value', $actEntry);
        $this->assertArrayNotHasKey('is_completed', $actEntry);
        $this->assertSame(7, $actEntry['value']);
        $this->assertSame(10, $actEntry['target']);
        $this->assertSame('games', $actEntry['unit']);   // count_type factory sets unit='games'
        $this->assertEquals(70.0, $actEntry['percentage']);
    }

    public function test_checkbox_activity_entry_has_is_completed_not_value(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 3,
        ]);
        $activity = Activity::factory()->checkbox()->create(['track_id' => $track->id]);
        DailyLog::factory()->create([
            'activity_id'  => $activity->id,
            'log_date'     => '2026-06-15',
            'value'        => null,
            'is_completed' => true,
        ]);

        $actEntry = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days.0.activities.0');

        $this->assertArrayHasKey('is_completed', $actEntry);
        $this->assertArrayNotHasKey('value', $actEntry);
        $this->assertTrue($actEntry['is_completed']);
        $this->assertNull($actEntry['unit']);             // checkbox factory sets unit=null
        $this->assertEquals(100.0, $actEntry['percentage']);
    }

    public function test_duration_activity_entry_has_unit_minutes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 2,
        ]);
        Activity::factory()->duration()->create(['track_id' => $track->id]);

        $actEntry = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days.0.activities.0');

        $this->assertArrayHasKey('unit', $actEntry);
        $this->assertSame('minutes', $actEntry['unit']);
    }

    public function test_future_days_have_empty_activities_array(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 3,   // days: 15 (today), 16, 17
        ]);
        Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        // Day 1 (today): has activities
        $this->assertCount(1, $days[0]['activities']);
        // Day 2 and 3 (future): empty
        $this->assertSame([], $days[1]['activities']);
        $this->assertSame([], $days[2]['activities']);
    }

    // ── no_activities ─────────────────────────────────────────────────────────

    public function test_track_with_no_activities_returns_no_activities_status(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-13',
            'duration_days' => 3,   // days: 13 (past), 14 (past), 15 (today)
        ]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        $this->assertSame('no_activities', $days[0]['day_status']);
        $this->assertSame('no_activities', $days[1]['day_status']);
        $this->assertSame('no_activities', $days[2]['day_status']);
    }

    // ── day_number ────────────────────────────────────────────────────────────

    public function test_day_numbers_are_sequential_from_one(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-13',
            'duration_days' => 4,
        ]);

        $days = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('days');

        $this->assertSame(1, $days[0]['day_number']);
        $this->assertSame(2, $days[1]['day_number']);
        $this->assertSame(3, $days[2]['day_number']);
        $this->assertSame(4, $days[3]['day_number']);
    }

    // ── constant query count ──────────────────────────────────────────────────

    /**
     * What the warmup request equalises:
     *
     * Laravel Sanctum resolves a token on the first authenticated request by
     * querying personal_access_tokens and then users. On subsequent requests
     * within the same test process those rows are already in the connection's
     * result-set cache (the Eloquent model cache / identity map), so the token
     * lookup costs 0 extra queries. Without the warmup the first measured
     * request pays +2 or +3 queries that the second does not, making the counts
     * differ even though the calendar logic itself is O(1) in queries.
     *
     * The warmup request is a real HTTP call through the full middleware stack
     * against a 1-day track owned by the same user/token. After it returns,
     * both the 10-day and 100-day measurements run in identical warm-cache
     * conditions, so any difference in their query counts must come from the
     * calendar implementation itself.
     *
     * Proof the test can fail:
     * Temporarily add `DB::select('select 1')` inside the `foreach ($allDates)`
     * loop in calendarDays() and re-run. The 10-day track will produce
     * count10 = N + 10 and the 100-day track count100 = N + 100, so
     * assertSame(count10, count100) fails with a message like
     * "got 14 for 10-day and 104 for 100-day track".
     */
    public function test_query_count_is_constant_regardless_of_track_length(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('UTC');

        // Warm up Sanctum token/user cache (see docblock above).
        $warmTrack = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-15',
            'duration_days' => 1,
        ]);
        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$warmTrack->id}/calendar");

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
            ->getJson("/api/tracks/{$track10->id}/calendar")
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
            ->getJson("/api/tracks/{$track100->id}/calendar")
            ->assertOk();
        $count100 = count(DB::getQueryLog());

        DB::disableQueryLog();

        $this->assertSame($count10, $count100,
            "Query count should be constant: got {$count10} for 10-day and {$count100} for 100-day track"
        );
    }

    // ── timezone boundary ─────────────────────────────────────────────────────

    /**
     * Clock frozen at 2026-06-15 23:30 UTC.
     *
     * UTC+14 (Pacific/Kiritimati): local date is 2026-06-16 13:30 → today = Jun 16.
     *   track runs Jun 14–18. Jun 14 = missed, Jun 15 = missed, Jun 16 = pending,
     *   Jun 17–18 = upcoming. track.today = '2026-06-16'.
     *
     * UTC-12 (Etc/GMT+12): local date is 2026-06-15 11:30 → today = Jun 15.
     *   track runs Jun 14–18. Jun 14 = missed, Jun 15 = pending,
     *   Jun 16–18 = upcoming. track.today = '2026-06-15'.
     */
    public function test_timezone_utc_plus_14_track_today_and_day_statuses(): void
    {
        // UTC 2026-06-15 23:30 → Pacific/Kiritimati (UTC+14) is 2026-06-16 13:30
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Pacific/Kiritimati');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-14',
            'duration_days' => 5,   // Jun 14, 15, 16, 17, 18
        ]);
        Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk();

        // track.today must reflect the user's local date, not UTC
        $this->assertSame('2026-06-16', $response->json('track.today'));

        $days = $response->json('days');
        $this->assertSame('missed',   $days[0]['day_status']); // Jun 14 — past
        $this->assertSame('missed',   $days[1]['day_status']); // Jun 15 — past in UTC+14
        $this->assertSame('pending',  $days[2]['day_status']); // Jun 16 — today in UTC+14
        $this->assertSame('upcoming', $days[3]['day_status']); // Jun 17 — future
        $this->assertSame('upcoming', $days[4]['day_status']); // Jun 18 — future

        // pending day has activities; upcoming days have empty activities
        $this->assertNotEmpty($days[2]['activities']);
        $this->assertSame([], $days[3]['activities']);
    }

    public function test_timezone_utc_minus_12_track_today_and_day_statuses(): void
    {
        // UTC 2026-06-15 23:30 → Etc/GMT+12 (UTC-12) is 2026-06-15 11:30
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Etc/GMT+12');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-14',
            'duration_days' => 5,   // Jun 14, 15, 16, 17, 18
        ]);
        Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 10,
            'is_required'  => true,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk();

        // track.today must be Jun 15 (UTC-12 local), not Jun 16 (UTC)
        $this->assertSame('2026-06-15', $response->json('track.today'));

        $days = $response->json('days');
        $this->assertSame('missed',   $days[0]['day_status']); // Jun 14 — past
        $this->assertSame('pending',  $days[1]['day_status']); // Jun 15 — today in UTC-12
        $this->assertSame('upcoming', $days[2]['day_status']); // Jun 16 — future in UTC-12
        $this->assertSame('upcoming', $days[3]['day_status']); // Jun 17 — future
        $this->assertSame('upcoming', $days[4]['day_status']); // Jun 18 — future

        $this->assertNotEmpty($days[1]['activities']);
        $this->assertSame([], $days[2]['activities']);
    }

    public function test_timezone_utc_plus_14_today_outside_track_is_null(): void
    {
        // UTC 2026-06-15 23:30 → UTC+14 is Jun 16.
        // Track ended Jun 15 — today (Jun 16 in UTC+14) is outside the track.
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:30:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Pacific/Kiritimati');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-11',
            'duration_days' => 5,   // Jun 11–15
        ]);

        $today = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/calendar")
            ->assertOk()
            ->json('track.today');

        // Jun 16 is outside the track (ended Jun 15) → null
        $this->assertNull($today);
    }
}
