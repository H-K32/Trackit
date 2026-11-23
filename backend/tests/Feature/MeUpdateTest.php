<?php

namespace Tests\Feature;

use App\Models\Track;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeUpdateTest extends TestCase
{
    use RefreshDatabase;

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
        $this->patchJson('/api/me', ['name' => 'Bob'])->assertStatus(401);
    }

    // ── name ──────────────────────────────────────────────────────────────────

    public function test_can_update_name(): void
    {
        [$user, $token] = $this->userWithToken();

        $response = $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['name' => 'New Name'])
            ->assertOk();

        $this->assertSame('New Name', $response->json('name'));
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'New Name']);
    }

    public function test_name_max_255_characters(): void
    {
        [, $token] = $this->userWithToken();

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['name' => str_repeat('a', 256)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    // ── email ─────────────────────────────────────────────────────────────────

    public function test_can_update_email_with_correct_current_password(): void
    {
        [$user, $token] = $this->userWithToken();

        $response = $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', [
                'email'            => 'new@example.com',
                'current_password' => 'password',
            ])
            ->assertOk();

        $this->assertSame('new@example.com', $response->json('email'));
        $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => 'new@example.com']);
    }

    public function test_email_change_requires_current_password(): void
    {
        [, $token] = $this->userWithToken();

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['email' => 'new@example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);
    }

    public function test_email_change_rejects_wrong_current_password(): void
    {
        [, $token] = $this->userWithToken();

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', [
                'email'            => 'new@example.com',
                'current_password' => 'wrongpassword',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);
    }

    public function test_email_must_be_unique_across_other_users(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        [, $token] = $this->userWithToken();

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', [
                'email'            => 'taken@example.com',
                'current_password' => 'password',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_submitting_own_email_unchanged_does_not_require_password(): void
    {
        [$user, $token] = $this->userWithToken();

        // Sending the same email as already stored — not a change, no password needed.
        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['email' => $user->email])
            ->assertOk();
    }

    public function test_email_uniqueness_check_ignores_own_record(): void
    {
        [$user, $token] = $this->userWithToken();

        // Sending own email with password should succeed (unique rule ignores self).
        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', [
                'email'            => $user->email,
                'current_password' => 'password',
            ])
            ->assertOk();
    }

    // ── timezone ──────────────────────────────────────────────────────────────

    public function test_can_update_timezone_with_no_active_track(): void
    {
        [$user, $token] = $this->userWithToken('UTC');

        // Only an upcoming track — not active.
        Track::factory()->upcoming()->create(['user_id' => $user->id]);

        $response = $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['timezone' => 'America/New_York'])
            ->assertOk();

        $this->assertSame('America/New_York', $response->json('timezone'));
    }

    public function test_timezone_locked_while_active_track_exists(): void
    {
        [$user, $token] = $this->userWithToken('UTC');

        Track::factory()->active()->create(['user_id' => $user->id]);

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['timezone' => 'America/New_York'])
            ->assertStatus(409)
            ->assertJson(['code' => 'timezone_locked']);
    }

    public function test_timezone_locked_only_for_own_active_tracks(): void
    {
        [$user, $token] = $this->userWithToken('UTC');
        $other = User::factory()->create();

        // Another user's active track must not lock this user's timezone.
        Track::factory()->active()->create(['user_id' => $other->id]);

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['timezone' => 'America/New_York'])
            ->assertOk();
    }

    public function test_timezone_not_locked_after_active_track_expires(): void
    {
        [$user, $token] = $this->userWithToken('UTC');

        Track::factory()->expired()->create(['user_id' => $user->id]);

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['timezone' => 'Europe/London'])
            ->assertOk();
    }

    public function test_invalid_timezone_is_rejected(): void
    {
        [, $token] = $this->userWithToken();

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['timezone' => 'Not/Real'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['timezone']);
    }

    // ── response shape ────────────────────────────────────────────────────────

    public function test_response_matches_get_me_shape(): void
    {
        [$user, $token] = $this->userWithToken();

        $getShape  = $this->withHeaders($this->auth($token))->getJson('/api/me')->json();
        $patchShape = $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['name' => 'Updated'])
            ->assertOk()
            ->json();

        // Same keys present in both responses.
        $this->assertSame(array_keys($getShape), array_keys($patchShape));
    }

    // ── partial update ────────────────────────────────────────────────────────

    public function test_omitted_fields_are_not_changed(): void
    {
        [$user, $token] = $this->userWithToken('UTC');
        $originalEmail = $user->email;

        $this->withHeaders($this->auth($token))
            ->patchJson('/api/me', ['name' => 'Only Name Changed'])
            ->assertOk();

        $this->assertDatabaseHas('users', [
            'id'    => $user->id,
            'email' => $originalEmail,
        ]);
    }
}
