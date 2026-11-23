<?php

namespace Tests\Feature;

use App\Enums\TrackStatus;
use App\Models\Track;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrackTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsUser(?string $timezone = 'UTC'): array
    {
        $user  = User::factory()->create(['timezone' => $timezone]);
        $token = $user->createToken('api')->plainTextToken;

        return [$user, $token];
    }

    private function authHeader(string $token): array
    {
        return ['Authorization' => "Bearer $token"];
    }

    /**
     * Valid payload uses tomorrow (UTC) so it always passes the new start_date rule.
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'name'          => 'Learn Spanish',
            'description'   => 'Daily practice',
            'start_date'    => Carbon::tomorrow('UTC')->toDateString(),
            'duration_days' => 30,
        ], $overrides);
    }

    // ── unauthenticated ───────────────────────────────────────────────────────

    public function test_unauthenticated_requests_receive_401(): void
    {
        $this->getJson('/api/tracks')->assertStatus(401);
        $this->postJson('/api/tracks', [])->assertStatus(401);
        $this->getJson('/api/tracks/1')->assertStatus(401);
        $this->putJson('/api/tracks/1', [])->assertStatus(401);
        $this->deleteJson('/api/tracks/1')->assertStatus(401);
    }

    // ── store ─────────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_create_a_track(): void
    {
        [$user, $token] = $this->actingAsUser();

        $response = $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload());

        $response->assertStatus(201)
            ->assertJsonStructure(['id', 'user_id', 'name', 'start_date', 'end_date', 'duration_days', 'status'])
            ->assertJsonFragment(['name' => 'Learn Spanish', 'user_id' => $user->id]);

        $this->assertDatabaseHas('tracks', ['name' => 'Learn Spanish', 'user_id' => $user->id]);
    }

    public function test_store_assigns_track_to_authenticated_user_not_submitted_user_id(): void
    {
        [$user, $token] = $this->actingAsUser();
        $other = User::factory()->create();

        // CHANGED: was '2025-01-01' (past) — now uses tomorrow so the only
        // validation error is the prohibited user_id, not start_date.
        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload(['user_id' => $other->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_store_rejects_submitted_status(): void
    {
        [, $token] = $this->actingAsUser();

        // CHANGED: was '2025-01-01' (past) — now uses tomorrow so the only
        // validation error is the prohibited status, not start_date.
        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload(['status' => 'active']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);
    }

    public function test_validation_rejects_missing_required_fields(): void
    {
        [, $token] = $this->actingAsUser();

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'start_date', 'duration_days']);
    }

    public function test_validation_rejects_duration_days_less_than_one(): void
    {
        [, $token] = $this->actingAsUser();

        // CHANGED: was '2025-01-01' (past) — now uses tomorrow so the only
        // validation error is duration_days, not start_date.
        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload(['duration_days' => 0]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['duration_days']);
    }

    public function test_validation_rejects_invalid_date(): void
    {
        [, $token] = $this->actingAsUser();

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload(['start_date' => 'not-a-date']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }

    public function test_store_rejects_start_date_in_the_past(): void
    {
        [, $token] = $this->actingAsUser('UTC');

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload([
                'start_date' => Carbon::yesterday('UTC')->toDateString(),
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }

    public function test_store_rejects_start_date_of_today(): void
    {
        [, $token] = $this->actingAsUser('UTC');

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload([
                'start_date' => Carbon::today('UTC')->toDateString(),
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }

    public function test_store_accepts_start_date_of_tomorrow(): void
    {
        [, $token] = $this->actingAsUser('UTC');

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/tracks', $this->validPayload([
                'start_date' => Carbon::tomorrow('UTC')->toDateString(),
            ]))
            ->assertStatus(201);
    }

    // ── index ─────────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_list_only_their_own_tracks(): void
    {
        [$user, $token] = $this->actingAsUser();
        $other          = User::factory()->create();

        Track::factory()->count(2)->create(['user_id' => $user->id]);
        Track::factory()->count(3)->create(['user_id' => $other->id]);

        $response = $this->withHeaders($this->authHeader($token))
            ->getJson('/api/tracks');

        $response->assertOk()->assertJsonCount(2);
    }

    // ── show ──────────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_view_their_own_track(): void
    {
        [$user, $token] = $this->actingAsUser();
        $track = Track::factory()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertOk()
            ->assertJsonFragment(['id' => $track->id]);
    }

    public function test_user_cannot_view_another_users_track(): void
    {
        [, $token] = $this->actingAsUser();
        $other     = User::factory()->create();
        $track     = Track::factory()->create(['user_id' => $other->id]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertStatus(403);
    }

    // ── update ────────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_update_their_own_track(): void
    {
        [$user, $token] = $this->actingAsUser();
        $track = Track::factory()->upcoming()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['name' => 'Updated Name'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'Updated Name']);
    }

    public function test_user_cannot_update_another_users_track(): void
    {
        [, $token] = $this->actingAsUser();
        $other     = User::factory()->create();
        $track     = Track::factory()->create(['user_id' => $other->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['name' => 'Hacked'])
            ->assertStatus(403);
    }

    public function test_update_rejects_submitted_status(): void
    {
        [$user, $token] = $this->actingAsUser();
        $track = Track::factory()->upcoming()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['status' => 'expired'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);
    }

    public function test_update_rejects_start_date_in_the_past(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->upcoming()->create(['user_id' => $user->id]);

        // A past date that is definitely not the stored start_date.
        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'start_date' => Carbon::today('UTC')->subDays(10)->toDateString(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }

    public function test_update_rejects_start_date_change_on_active_track(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->active()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'start_date' => Carbon::tomorrow('UTC')->toDateString(),
            ])
            ->assertStatus(409)
            ->assertJson(['code' => 'track_started']);
    }

    public function test_update_rejects_duration_change_on_active_track(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->active()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['duration_days' => 60])
            ->assertStatus(409)
            ->assertJson(['code' => 'track_started']);
    }

    public function test_update_rejects_start_date_change_on_expired_track(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->expired()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'start_date' => Carbon::tomorrow('UTC')->toDateString(),
            ])
            ->assertStatus(409)
            ->assertJson(['code' => 'track_started']);
    }

    public function test_update_allows_name_change_on_active_track(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->active()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'New Name']);
    }

    public function test_update_allows_name_change_on_expired_track(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->expired()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonFragment(['name' => 'Renamed']);
    }

    public function test_full_put_with_unchanged_schedule_on_active_track_returns_200(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->active()->create(['user_id' => $user->id]);

        // Send all fields including the stored start_date and duration_days unchanged.
        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'name'          => 'New Name',
                'description'   => 'Updated description',
                'start_date'    => $track->start_date->toDateString(),
                'duration_days' => $track->duration_days,
            ])
            ->assertOk()
            ->assertJsonFragment(['name' => 'New Name']);
    }

    public function test_full_put_with_unchanged_schedule_on_expired_track_returns_200(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->expired()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'name'          => 'New Name',
                'description'   => 'Updated description',
                'start_date'    => $track->start_date->toDateString(),
                'duration_days' => $track->duration_days,
            ])
            ->assertOk()
            ->assertJsonFragment(['name' => 'New Name']);
    }

    public function test_update_changed_start_date_on_upcoming_track_must_be_tomorrow_or_later(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        // upcoming() starts +3 days; we send a different date that is in the past.
        $track = Track::factory()->upcoming()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->putJson("/api/tracks/{$track->id}", [
                'start_date' => Carbon::today('UTC')->subDays(5)->toDateString(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_date']);
    }

    // ── destroy ───────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_delete_their_own_track(): void
    {
        [$user, $token] = $this->actingAsUser();
        $track = Track::factory()->create(['user_id' => $user->id]);

        $this->withHeaders($this->authHeader($token))
            ->deleteJson("/api/tracks/{$track->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('tracks', ['id' => $track->id]);
    }

    public function test_user_cannot_delete_another_users_track(): void
    {
        [, $token] = $this->actingAsUser();
        $other     = User::factory()->create();
        $track     = Track::factory()->create(['user_id' => $other->id]);

        $this->withHeaders($this->authHeader($token))
            ->deleteJson("/api/tracks/{$track->id}")
            ->assertStatus(403);
    }

    // ── status calculation ────────────────────────────────────────────────────

    public function test_status_is_upcoming_when_start_date_is_in_the_future(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => Carbon::now('UTC')->addDays(5)->toDateString(),
            'duration_days' => 10,
        ]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertOk()
            ->assertJsonFragment(['status' => TrackStatus::Upcoming->value]);
    }

    public function test_status_is_active_when_today_is_within_range(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => Carbon::now('UTC')->subDays(2)->toDateString(),
            'duration_days' => 10,
        ]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertOk()
            ->assertJsonFragment(['status' => TrackStatus::Active->value]);
    }

    public function test_status_is_expired_when_end_date_has_passed(): void
    {
        [$user, $token] = $this->actingAsUser('UTC');
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => Carbon::now('UTC')->subDays(15)->toDateString(),
            'duration_days' => 10,
        ]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertOk()
            ->assertJsonFragment(['status' => TrackStatus::Expired->value]);
    }

    public function test_end_date_is_calculated_correctly(): void
    {
        [$user, $token] = $this->actingAsUser();
        $track = Track::factory()->create([
            'user_id'       => $user->id,
            'start_date'    => '2025-01-01',
            'duration_days' => 30,
        ]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/tracks/{$track->id}")
            ->assertOk()
            ->assertJsonFragment(['end_date' => '2025-01-30']);
    }
}
