<?php

namespace Tests\Feature;

use App\Enums\TrackingType;
use App\Models\Activity;
use App\Models\DailyLog;
use App\Models\Track;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DailyLogTest extends TestCase
{
    use RefreshDatabase;

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

    private function activeTrack(User $user): Track
    {
        return Track::factory()->active()->create(['user_id' => $user->id]);
    }

    private function expiredTrack(User $user): Track
    {
        return Track::factory()->expired()->create(['user_id' => $user->id]);
    }

    private function countActivity(Track $track, int $target = 10): Activity
    {
        return Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => $target,
        ]);
    }

    private function durationActivity(Track $track, int $target = 30): Activity
    {
        return Activity::factory()->duration()->create([
            'track_id'     => $track->id,
            'daily_target' => $target,
        ]);
    }

    private function checkboxActivity(Track $track): Activity
    {
        return Activity::factory()->checkbox()->create(['track_id' => $track->id]);
    }

    /** A date that falls within the active track's range and is not in the future. */
    private function validDate(Track $track): string
    {
        return $track->start_date->toDateString();
    }

    // ── unauthenticated ───────────────────────────────────────────────────────

    public function test_unauthenticated_cannot_access_any_log_endpoint(): void
    {
        $this->getJson('/api/tracks/1/daily-logs?date=2026-01-01')->assertStatus(401);
        $this->getJson('/api/tracks/1/activities/1/logs?from=2026-01-01&to=2026-01-02')->assertStatus(401);
        $this->putJson('/api/tracks/1/activities/1/logs/2026-01-01', [])->assertStatus(401);
        $this->getJson('/api/tracks/1/activities/1/logs/2026-01-01')->assertStatus(401);
        $this->deleteJson('/api/tracks/1/activities/1/logs/2026-01-01')->assertStatus(401);
    }

    // ── upsert: count ─────────────────────────────────────────────────────────

    public function test_can_create_count_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 7,
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['actual_value' => 7, 'activity_id' => $activity->id]);

        $this->assertDatabaseHas('daily_logs', ['activity_id' => $activity->id, 'value' => 7]);
    }

    public function test_can_create_duration_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->durationActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 45,
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['actual_value' => 45]);
    }

    public function test_can_create_checkbox_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->checkboxActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'is_completed' => true,
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['is_completed' => true]);
    }

    public function test_upsert_updates_existing_log_on_same_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 3,
            ])->assertStatus(201);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 9,
            ])->assertStatus(200)
            ->assertJsonFragment(['actual_value' => 9]);

        $this->assertDatabaseCount('daily_logs', 1);
        $this->assertDatabaseHas('daily_logs', ['activity_id' => $activity->id, 'value' => 9]);
    }

    public function test_only_one_record_exists_per_activity_per_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        for ($i = 0; $i < 3; $i++) {
            $this->withHeaders($this->auth($token))
                ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                    'value' => $i,
                ]);
        }

        $this->assertDatabaseCount('daily_logs', 1);
    }

    public function test_allows_zero_progress(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 0,
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['actual_value' => 0]);
    }

    public function test_allows_value_exceeding_target(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 5);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 20,
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['actual_value' => 20, 'target_met' => true]);
    }

    public function test_rejects_negative_value(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => -1,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_rejects_value_for_checkbox_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->checkboxActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_rejects_is_completed_for_count_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'is_completed' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_completed']);
    }

    public function test_rejects_prohibited_fields(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value'       => 5,
                'activity_id' => 99,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['activity_id']);
    }

    // ── date validation ───────────────────────────────────────────────────────

    public function test_rejects_date_before_track_start(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $before   = $track->start_date->copy()->subDay()->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$before}", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    public function test_rejects_date_after_track_end(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);
        $after    = Carbon::parse($track->end_date)->addDay()->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$after}", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    public function test_rejects_future_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => Carbon::today('UTC')->subDays(5)->toDateString(),
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);
        $tomorrow = Carbon::tomorrow('UTC')->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$tomorrow}", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    public function test_allows_valid_past_date_within_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $track->start_date->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 3,
            ])
            ->assertStatus(201);
    }

    public function test_timezone_aware_date_validation(): void
    {
        [$user, $token] = $this->userWithToken('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => Carbon::today('UTC')->subDays(5)->toDateString(),
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);
        $tomorrow = Carbon::tomorrow('UTC')->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$tomorrow}", [
                'value' => 1,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    public function test_rejects_invalid_date_format(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/not-a-date", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['log_date']);
    }

    // ── overview ──────────────────────────────────────────────────────────────

    public function test_overview_includes_all_activities(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->activeTrack($user);
        Activity::factory()->count(3)->create(['track_id' => $track->id]);
        $date = $track->start_date->toDateString();

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/daily-logs?date={$date}")
            ->assertOk()
            ->assertJsonCount(3);
    }

    public function test_overview_shows_no_progress_for_activities_without_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $track->start_date->toDateString();

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/daily-logs?date={$date}")
            ->assertOk();

        $entry = collect($response->json())->firstWhere('activity_id', $activity->id);
        $this->assertNull($entry['actual_value']);
        $this->assertNull($entry['log_id']);
        $this->assertFalse($entry['target_met']);
        $this->assertEquals(0, $entry['progress_percentage']);
    }

    public function test_overview_shows_progress_for_activities_with_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 10);
        $date     = $track->start_date->toDateString();

        DailyLog::factory()->withValue(7)->create([
            'activity_id' => $activity->id,
            'log_date'    => $date,
        ]);

        $response = $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/daily-logs?date={$date}")
            ->assertOk();

        $entry = collect($response->json())->firstWhere('activity_id', $activity->id);
        $this->assertEquals(7, $entry['actual_value']);
        $this->assertNotNull($entry['log_id']);
    }

    public function test_overview_requires_date_parameter(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->activeTrack($user);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/daily-logs")
            ->assertStatus(422);
    }

    public function test_overview_rejects_invalid_date_format(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->activeTrack($user);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/daily-logs?date=bad-date")
            ->assertStatus(422);
    }

    // ── history ───────────────────────────────────────────────────────────────

    public function test_history_returns_logs_in_date_range(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);

        $start = $track->start_date->toDateString();
        $day2  = $track->start_date->copy()->addDay()->toDateString();
        $day3  = $track->start_date->copy()->addDays(2)->toDateString();

        DailyLog::factory()->withValue(5)->create(['activity_id' => $activity->id, 'log_date' => $start]);
        DailyLog::factory()->withValue(8)->create(['activity_id' => $activity->id, 'log_date' => $day2]);
        DailyLog::factory()->withValue(3)->create(['activity_id' => $activity->id, 'log_date' => $day3]);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from={$start}&to={$day2}")
            ->assertOk()
            ->assertJsonCount(2);
    }

    public function test_history_requires_from_and_to(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['from', 'to']);
    }

    public function test_history_rejects_to_before_from(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from=2026-01-10&to=2026-01-05")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to']);
    }

    // ── progress calculations ─────────────────────────────────────────────────

    public function test_target_met_is_true_when_value_equals_target(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 10);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 10,
            ])
            ->assertJsonFragment(['target_met' => true]);
    }

    public function test_target_met_is_false_when_value_below_target(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 10);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 7,
            ])
            ->assertJsonFragment(['target_met' => false]);
    }

    public function test_progress_percentage_is_correct(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 10);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 7,
            ])
            ->assertJsonFragment(['progress_percentage' => 70]);
    }

    public function test_progress_percentage_is_capped_at_100(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 5);
        $date     = $this->validDate($track);

        $response = $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 20,
            ])
            ->assertJsonFragment(['progress_percentage' => 100]);

        $this->assertEquals(20, $response->json('actual_value'));
    }

    public function test_checkbox_completed_is_100_percent(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->checkboxActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'is_completed' => true,
            ])
            ->assertJsonFragment(['progress_percentage' => 100, 'target_met' => true]);
    }

    public function test_checkbox_not_completed_is_0_percent(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->checkboxActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'is_completed' => false,
            ])
            ->assertJsonFragment(['progress_percentage' => 0, 'target_met' => false]);
    }

    // ── deletion ──────────────────────────────────────────────────────────────

    public function test_can_delete_a_daily_log(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);
        $log      = DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $date,
        ]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('daily_logs', ['id' => $log->id]);
    }

    public function test_deleting_log_does_not_delete_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);
        $log      = DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $date,
        ]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}")
            ->assertStatus(204);

        $this->assertDatabaseHas('activities', ['id' => $activity->id]);
    }

    public function test_deleting_log_does_not_delete_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);
        $log      = DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $date,
        ]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}")
            ->assertStatus(204);

        $this->assertDatabaseHas('tracks', ['id' => $track->id]);
    }

    // ── ownership ─────────────────────────────────────────────────────────────

    public function test_another_user_cannot_view_overview(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = $this->activeTrack($owner);
        $date  = $track->start_date->toDateString();

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/daily-logs?date={$date}")
            ->assertStatus(403);
    }

    public function test_another_user_cannot_view_history(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->activeTrack($owner);
        $activity = $this->countActivity($track);
        $date     = $track->start_date->toDateString();

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from={$date}&to={$date}")
            ->assertStatus(403);
    }

    public function test_another_user_cannot_create_log(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->activeTrack($owner);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($otherToken))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
            ])
            ->assertStatus(403);
    }

    public function test_another_user_cannot_delete_log(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->activeTrack($owner);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);
        DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $date,
        ]);

        $this->withHeaders($this->auth($otherToken))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}")
            ->assertStatus(403);
    }

    public function test_log_under_wrong_activity_returns_404(): void
    {
        [$user, $token] = $this->userWithToken();
        $track     = $this->activeTrack($user);
        $activityA = $this->countActivity($track);
        $activityB = Activity::factory()->count_type()->create([
            'track_id'     => Track::factory()->active()->create(['user_id' => $user->id])->id,
            'daily_target' => 10,
        ]);
        $date = $this->validDate($track);

        // activityB belongs to a different track — URL uses activityA's track but activityB's ID.
        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activityB->id}/logs/{$date}")
            ->assertStatus(404);
    }

    // ── cascade deletion ──────────────────────────────────────────────────────

    public function test_deleting_activity_cascades_to_daily_logs(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $log      = DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $this->validDate($track),
        ]);

        // Delete via the DB directly (activity delete is locked on active tracks via API).
        $activity->delete();

        $this->assertDatabaseMissing('daily_logs', ['id' => $log->id]);
    }

    public function test_deleting_track_cascades_to_daily_logs(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $log      = DailyLog::factory()->withValue(5)->create([
            'activity_id' => $activity->id,
            'log_date'    => $this->validDate($track),
        ]);

        $track->delete();

        $this->assertDatabaseMissing('daily_logs', ['id' => $log->id]);
        $this->assertDatabaseMissing('activities', ['id' => $activity->id]);
    }

    // ── expired track logs ────────────────────────────────────────────────────

    public function test_can_log_on_expired_track_for_past_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);
        $date     = $track->start_date->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
            ])
            ->assertStatus(201);
    }

    // ── NEW: quantity caps ────────────────────────────────────────────────────

    public function test_count_rejects_value_above_10000(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'value' => 10001,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_count_accepts_value_of_10000(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track, 10000);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'value' => 10000,
            ])
            ->assertStatus(201);
    }

    public function test_duration_rejects_value_above_1440(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->durationActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'value' => 1441,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_duration_accepts_value_of_1440(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->durationActivity($track, 1440);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'value' => 1440,
            ])
            ->assertStatus(201);
    }

    public function test_count_rejects_is_completed(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'is_completed' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_completed']);
    }

    public function test_duration_rejects_is_completed(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->durationActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'is_completed' => true,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_completed']);
    }

    public function test_checkbox_rejects_value(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->checkboxActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$this->validDate($track)}", [
                'value' => 1,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    // ── NEW: impossible calendar date ─────────────────────────────────────────

    public function test_rejects_impossible_calendar_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-02-30", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['log_date']);
    }

    // ── NEW: log_date_out_of_range code ───────────────────────────────────────

    public function test_date_window_violation_returns_log_date_out_of_range_code(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $before   = $track->start_date->copy()->subDay()->toDateString();

        $response = $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$before}", [
                'value' => 5,
            ])
            ->assertStatus(422);

        $this->assertSame('log_date_out_of_range', $response->json('code'));
    }

    // ── NEW: upcoming track ───────────────────────────────────────────────────

    public function test_upcoming_track_rejects_any_log_date(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = Track::factory()->upcoming()->create(['user_id' => $user->id]);
        $activity = $this->countActivity($track);
        $date     = $track->start_date->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    // ── NEW: window edge cases ────────────────────────────────────────────────

    public function test_allows_log_on_last_day_of_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);
        $lastDay  = Carbon::parse($track->end_date)->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$lastDay}", [
                'value' => 3,
            ])
            ->assertStatus(201);
    }

    public function test_rejects_log_on_day_after_last_day_of_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);
        $dayAfter = Carbon::parse($track->end_date)->addDay()->toDateString();

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$dayAfter}", [
                'value' => 3,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);
    }

    // ── NEW: timezone boundary ────────────────────────────────────────────────

    public function test_timezone_utc_plus_14_today_is_accepted(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Pacific/Kiritimati');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-06-16", [
                'value' => 1,
            ])
            ->assertStatus(201);

        Carbon::setTestNow();
    }

    public function test_timezone_utc_plus_14_tomorrow_is_rejected(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-15 23:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Pacific/Kiritimati');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-06-17", [
                'value' => 1,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);

        Carbon::setTestNow();
    }

    public function test_timezone_utc_minus_12_today_is_accepted(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-16 02:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Etc/GMT+12');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-06-15", [
                'value' => 1,
            ])
            ->assertStatus(201);

        Carbon::setTestNow();
    }

    public function test_timezone_utc_minus_12_utc_today_is_future(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-16 02:00:00', 'UTC'));

        [$user, $token] = $this->userWithToken('Etc/GMT+12');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2026-06-10',
            'duration_days' => 365,
        ]);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-06-16", [
                'value' => 1,
            ])
            ->assertStatus(422)
            ->assertJson(['code' => 'log_date_out_of_range']);

        Carbon::setTestNow();
    }

    // ── NEW: ownership before 422 ─────────────────────────────────────────────

    public function test_invalid_body_on_another_users_track_returns_403_not_422(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->activeTrack($owner);
        $activity = $this->countActivity($track);

        // Body is deliberately invalid, but ownership check must fire first.
        $this->withHeaders($this->auth($otherToken))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/2026-01-01", [
                'value' => -999,
            ])
            ->assertStatus(403);
    }

    public function test_invalid_range_on_another_users_track_returns_403_not_422(): void
    {
        [$owner]        = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->activeTrack($owner);
        $activity = $this->countActivity($track);

        // from > to is invalid, but ownership check must fire first.
        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from=2026-01-10&to=2026-01-01")
            ->assertStatus(403);
    }

    // ── NEW: notes ────────────────────────────────────────────────────────────

    public function test_notes_are_stored_and_returned(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
                'notes' => 'Felt great today',
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['notes' => 'Felt great today']);

        $this->assertDatabaseHas('daily_logs', ['notes' => 'Felt great today']);
    }

    public function test_notes_are_trimmed(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
                'notes' => '  trimmed  ',
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['notes' => 'trimmed']);
    }

    public function test_empty_notes_stored_as_null(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
                'notes' => '   ',
            ])
            ->assertStatus(201)
            ->assertJsonFragment(['notes' => null]);

        $this->assertDatabaseHas('daily_logs', ['notes' => null]);
    }

    public function test_notes_max_1000_characters(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);
        $date     = $this->validDate($track);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs/{$date}", [
                'value' => 5,
                'notes' => str_repeat('a', 1001),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['notes']);
    }

    // ── NEW: history 366-day cap ──────────────────────────────────────────────

    public function test_history_rejects_range_over_366_days(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from=2024-01-01&to=2025-06-01")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['to']);
    }

    public function test_history_accepts_range_of_exactly_366_days(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = $this->countActivity($track);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}/logs?from=2024-01-01&to=2025-01-01")
            ->assertOk();
    }
}
