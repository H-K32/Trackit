<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    // ── register ──────────────────────────────────────────────────────────────

    public function test_register_creates_user_and_returns_token(): void
    {
        $response = $this->postJson('/api/register', [
            'name'                  => 'Alice',
            'email'                 => 'alice@example.com',
            'password'              => 'secret123',
            'password_confirmation' => 'secret123',
            'timezone'              => 'America/New_York',
        ]);

        $response->assertStatus(201)
                 ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'timezone']]);

        $this->assertDatabaseHas('users', ['email' => 'alice@example.com']);
    }

    public function test_register_fails_with_duplicate_email(): void
    {
        User::factory()->create(['email' => 'alice@example.com']);

        $this->postJson('/api/register', [
            'name'                  => 'Alice',
            'email'                 => 'alice@example.com',
            'password'              => 'secret123',
            'password_confirmation' => 'secret123',
            'timezone'              => 'UTC',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_register_fails_with_invalid_timezone(): void
    {
        $this->postJson('/api/register', [
            'name'                  => 'Alice',
            'email'                 => 'alice@example.com',
            'password'              => 'secret123',
            'password_confirmation' => 'secret123',
            'timezone'              => 'Not/ATimezone',
        ])->assertStatus(422)->assertJsonValidationErrors(['timezone']);
    }

    public function test_register_fails_when_password_not_confirmed(): void
    {
        $this->postJson('/api/register', [
            'name'                  => 'Alice',
            'email'                 => 'alice@example.com',
            'password'              => 'secret123',
            'password_confirmation' => 'different',
            'timezone'              => 'UTC',
        ])->assertStatus(422)->assertJsonValidationErrors(['password']);
    }

    // ── login ─────────────────────────────────────────────────────────────────

    public function test_login_returns_token_for_valid_credentials(): void
    {
        User::factory()->create([
            'email'    => 'bob@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->postJson('/api/login', [
            'email'    => 'bob@example.com',
            'password' => 'secret123',
        ])->assertOk()->assertJsonStructure(['token', 'user']);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        User::factory()->create([
            'email'    => 'bob@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $this->postJson('/api/login', [
            'email'    => 'bob@example.com',
            'password' => 'wrongpassword',
        ])->assertStatus(401)->assertJson(['message' => 'Invalid credentials.']);
    }

    public function test_login_fails_with_wrong_email(): void
    {
        $this->postJson('/api/login', [
            'email'    => 'nobody@example.com',
            'password' => 'secret123',
        ])->assertStatus(401)->assertJson(['message' => 'Invalid credentials.']);
    }

    public function test_login_wrong_email_and_wrong_password_return_same_error(): void
    {
        User::factory()->create([
            'email'    => 'bob@example.com',
            'password' => bcrypt('secret123'),
        ]);

        $wrongEmail = $this->postJson('/api/login', [
            'email'    => 'nobody@example.com',
            'password' => 'secret123',
        ])->json();

        $wrongPassword = $this->postJson('/api/login', [
            'email'    => 'bob@example.com',
            'password' => 'wrongpassword',
        ])->json();

        $this->assertSame($wrongEmail, $wrongPassword);
    }

    // ── logout ────────────────────────────────────────────────────────────────

    public function test_logout_revokes_token(): void
    {
        $user  = User::factory()->create();
        $token = $user->createToken('api')->plainTextToken;

        $this->withHeader('Authorization', "Bearer $token")
             ->postJson('/api/logout')
             ->assertOk()
             ->assertJson(['message' => 'Logged out.']);

        // Flush the resolved auth guard so the next request re-authenticates
        // from the database rather than the in-memory cache.
        auth()->forgetGuards();

        $this->withHeader('Authorization', "Bearer $token")
             ->getJson('/api/me')
             ->assertStatus(401);
    }

    public function test_logout_requires_authentication(): void
    {
        $this->postJson('/api/logout')->assertStatus(401);
    }

    // ── me ────────────────────────────────────────────────────────────────────

    public function test_me_returns_authenticated_user(): void
    {
        $user  = User::factory()->create();
        $token = $user->createToken('api')->plainTextToken;

        $this->withHeader('Authorization', "Bearer $token")
             ->getJson('/api/me')
             ->assertOk()
             ->assertJsonFragment(['email' => $user->email]);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertStatus(401);
    }
}
