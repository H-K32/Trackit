<?php

namespace Tests\Feature;

use App\Enums\TrackingType;
use App\Models\Activity;
use App\Models\Track;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActivityTest extends TestCase
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

    private function upcomingTrack(User $user): Track
    {
        return Track::factory()->upcoming()->create(['user_id' => $user->id]);
    }

    private function activeTrack(User $user): Track
    {
        return Track::factory()->active()->create(['user_id' => $user->id]);
    }

    private function expiredTrack(User $user): Track
    {
        return Track::factory()->expired()->create(['user_id' => $user->id]);
    }

    private function countPayload(array $overrides = []): array
    {
        return array_merge([
            'name'          => 'Chess Games',
            'tracking_type' => TrackingType::Count->value,
            'daily_target'  => 3,
            'unit'          => 'games',
        ], $overrides);
    }

    private function durationPayload(array $overrides = []): array
    {
        return array_merge([
            'name'          => 'Opening Study',
            'tracking_type' => TrackingType::Duration->value,
            'daily_target'  => 30,
        ], $overrides);
    }

    private function checkboxPayload(array $overrides = []): array
    {
        return array_merge([
            'name'          => 'Chess Lesson',
            'tracking_type' => TrackingType::Checkbox->value,
        ], $overrides);
    }

    // ── unauthenticated ───────────────────────────────────────────────────────

    public function test_unauthenticated_cannot_access_any_activity_endpoint(): void
    {
        $this->getJson('/api/tracks/1/activities')->assertStatus(401);
        $this->postJson('/api/tracks/1/activities', [])->assertStatus(401);
        $this->getJson('/api/tracks/1/activities/1')->assertStatus(401);
        $this->putJson('/api/tracks/1/activities/1', [])->assertStatus(401);
        $this->deleteJson('/api/tracks/1/activities/1')->assertStatus(401);
        $this->getJson('/api/activity-templates')->assertStatus(401);
    }

    // ── templates ─────────────────────────────────────────────────────────────

    public function test_templates_endpoint_returns_all_templates(): void
    {
        [, $token] = $this->userWithToken();

        $response = $this->withHeaders($this->auth($token))
            ->getJson('/api/activity-templates');

        $response->assertOk()
            ->assertJsonStructure([['key', 'name', 'tracking_type', 'daily_target']]);

        $this->assertCount(7, $response->json());
    }

    public function test_duration_templates_express_targets_in_minutes(): void
    {
        [, $token] = $this->userWithToken();

        $templates = $this->withHeaders($this->auth($token))
            ->getJson('/api/activity-templates')
            ->json();

        foreach ($templates as $t) {
            if ($t['tracking_type'] === TrackingType::Duration->value) {
                $this->assertEquals('minutes', $t['unit']);
                $this->assertGreaterThan(0, $t['daily_target']);
            }
        }
    }

    // ── store ─────────────────────────────────────────────────────────────────

    public function test_can_create_count_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $response = $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload());

        $response->assertStatus(201)
            ->assertJsonFragment([
                'tracking_type' => 'count',
                'unit'          => 'games',
                'daily_target'  => 3,
            ]);
    }

    public function test_can_create_duration_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $response = $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->durationPayload());

        $response->assertStatus(201)
            ->assertJsonFragment(['tracking_type' => 'duration', 'unit' => 'minutes']);
    }

    public function test_duration_unit_is_forced_to_minutes_server_side(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        // Client omits unit entirely — server must set it to minutes.
        $response = $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->durationPayload());

        $response->assertStatus(201)->assertJsonFragment(['unit' => 'minutes']);
    }

    public function test_duration_rejects_unit_other_than_minutes(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->durationPayload(['unit' => 'hours']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['unit']);
    }

    public function test_can_create_checkbox_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $response = $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->checkboxPayload());

        $response->assertStatus(201)
            ->assertJsonFragment(['tracking_type' => 'checkbox', 'daily_target' => 1, 'unit' => null]);
    }

    public function test_checkbox_target_is_forced_to_1_server_side(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        // Client omits daily_target — server must set it to 1.
        $response = $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->checkboxPayload());

        $response->assertStatus(201)->assertJsonFragment(['daily_target' => 1]);
    }

    public function test_checkbox_rejects_target_other_than_1(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->checkboxPayload(['daily_target' => 5]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['daily_target']);
    }

    public function test_store_rejects_invalid_tracking_type(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['tracking_type' => 'invalid']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_type']);
    }

    public function test_store_rejects_missing_required_fields(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'tracking_type']);
    }

    public function test_store_rejects_target_less_than_one(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['daily_target' => 0]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['daily_target']);
    }

    public function test_store_rejects_invalid_is_required(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['is_required' => 'maybe']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['is_required']);
    }

    public function test_store_rejects_prohibited_track_id(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['track_id' => 99]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['track_id']);
    }

    public function test_store_rejects_duplicate_name_case_insensitive(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        Activity::factory()->create(['track_id' => $track->id, 'name' => 'Chess Games']);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['name' => 'chess games']))
            ->assertStatus(422);
    }

    public function test_store_rejects_21st_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        Activity::factory()->count(20)->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload(['name' => 'Extra']))
            ->assertStatus(422);
    }

    // ── index ─────────────────────────────────────────────────────────────────

    public function test_index_returns_only_activities_for_the_given_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track  = $this->upcomingTrack($user);
        $other  = $this->upcomingTrack($user);

        Activity::factory()->count(3)->create(['track_id' => $track->id]);
        Activity::factory()->count(2)->create(['track_id' => $other->id]);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities")
            ->assertOk()
            ->assertJsonCount(3);
    }

    // ── show ──────────────────────────────────────────────────────────────────

    public function test_can_view_own_activity(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $activity->id]);
    }

    public function test_activity_under_wrong_track_returns_404(): void
    {
        [$user, $token] = $this->userWithToken();
        $track  = $this->upcomingTrack($user);
        $other  = $this->upcomingTrack($user);
        $activity = Activity::factory()->create(['track_id' => $other->id]);

        // Activity belongs to $other, but URL uses $track — must 404.
        $this->withHeaders($this->auth($token))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(404);
    }

    // ── update ────────────────────────────────────────────────────────────────

    public function test_can_update_activity_on_upcoming_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['name' => 'Updated'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'Updated']);
    }

    public function test_partial_update_only_changes_sent_fields(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->count_type()->create([
            'track_id'    => $track->id,
            'name'        => 'Original',
            'description' => 'Original desc',
        ]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['name' => 'Changed'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'Changed', 'description' => 'Original desc']);
    }

    public function test_update_rejects_invalid_tracking_type(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['tracking_type' => 'bad'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tracking_type']);
    }

    public function test_update_changing_type_revalidates_target_and_unit(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        // Switching to duration but sending unit=hours should fail.
        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", [
                'tracking_type' => 'duration',
                'unit'          => 'hours',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['unit']);
    }

    public function test_update_rejects_duplicate_name_case_insensitive(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->upcomingTrack($user);

        Activity::factory()->create(['track_id' => $track->id, 'name' => 'Puzzles']);
        $activity = Activity::factory()->create(['track_id' => $track->id, 'name' => 'Games']);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['name' => 'PUZZLES'])
            ->assertStatus(422);
    }

    // ── destroy ───────────────────────────────────────────────────────────────

    public function test_can_delete_activity_on_upcoming_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('activities', ['id' => $activity->id]);
    }

    public function test_deleting_activity_does_not_delete_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(204);

        $this->assertDatabaseHas('tracks', ['id' => $track->id]);
    }

    // ── ownership ─────────────────────────────────────────────────────────────

    public function test_another_user_cannot_list_activities(): void
    {
        [$owner]       = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = $this->upcomingTrack($owner);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/activities")
            ->assertStatus(403);
    }

    public function test_another_user_cannot_view_activity(): void
    {
        [$owner]       = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->upcomingTrack($owner);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($otherToken))
            ->getJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(403);
    }

    public function test_another_user_cannot_create_activity(): void
    {
        [$owner]       = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track = $this->upcomingTrack($owner);

        $this->withHeaders($this->auth($otherToken))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload())
            ->assertStatus(403);
    }

    public function test_another_user_cannot_update_activity(): void
    {
        [$owner]       = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->upcomingTrack($owner);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($otherToken))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['name' => 'Hacked'])
            ->assertStatus(403);
    }

    public function test_another_user_cannot_delete_activity(): void
    {
        [$owner]       = $this->userWithToken();
        [, $otherToken] = $this->userWithToken();
        $track    = $this->upcomingTrack($owner);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($otherToken))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(403);
    }

    // ── track status restrictions ─────────────────────────────────────────────

    public function test_cannot_create_activity_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->activeTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload())
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_cannot_create_activity_on_expired_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track = $this->expiredTrack($user);

        $this->withHeaders($this->auth($token))
            ->postJson("/api/tracks/{$track->id}/activities", $this->countPayload())
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_cannot_delete_activity_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_cannot_delete_activity_on_expired_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}/activities/{$activity->id}")
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_can_update_name_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'New Name']);
    }

    public function test_can_update_description_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['description' => 'Updated'])
            ->assertOk()
            ->assertJsonFragment(['description' => 'Updated']);
    }

    public function test_cannot_change_tracking_type_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->count_type()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", [
                'tracking_type' => 'duration',
            ])
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_cannot_change_daily_target_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 5,
        ]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['daily_target' => 10])
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    public function test_sending_same_value_for_locked_field_is_allowed_on_active_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->activeTrack($user);
        $activity = Activity::factory()->count_type()->create([
            'track_id'     => $track->id,
            'daily_target' => 5,
        ]);

        // Sending the same value should NOT trigger the lock.
        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", [
                'name'         => $activity->name,
                'daily_target' => 5,
            ])
            ->assertOk();
    }

    public function test_cannot_change_is_required_on_expired_track(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->expiredTrack($user);
        $activity = Activity::factory()->count_type()->create([
            'track_id'    => $track->id,
            'is_required' => true,
        ]);

        $this->withHeaders($this->auth($token))
            ->putJson("/api/tracks/{$track->id}/activities/{$activity->id}", ['is_required' => false])
            ->assertStatus(409)
            ->assertJson(['code' => 'activities_locked']);
    }

    // ── relationships ─────────────────────────────────────────────────────────

    public function test_deleting_track_cascades_to_activities(): void
    {
        [$user, $token] = $this->userWithToken();
        $track    = $this->upcomingTrack($user);
        $activity = Activity::factory()->create(['track_id' => $track->id]);

        $this->withHeaders($this->auth($token))
            ->deleteJson("/api/tracks/{$track->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('activities', ['id' => $activity->id]);
    }
}
