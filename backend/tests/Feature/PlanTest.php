<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlanTest extends TestCase
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

    public function test_unauthenticated_requests_receive_401(): void
    {
        $this->getJson('/api/plans')->assertStatus(401);
        $this->postJson('/api/plans', [])->assertStatus(401);
        $this->getJson('/api/plans/1')->assertStatus(401);
        $this->patchJson('/api/plans/1', [])->assertStatus(401);
        $this->deleteJson('/api/plans/1')->assertStatus(401);
    }

    public function test_user_can_create_titled_plan_with_optional_date_and_pin(): void
    {
        [$user, $token] = $this->actingAsUser();

        $response = $this->withHeaders($this->authHeader($token))
            ->postJson('/api/plans', [
                'title'     => "Tomorrow's Plan",
                'content'   => "- [ ] Morning run\n- [ ] Finish essay",
                'plan_date' => '2026-11-28',
                'is_pinned' => true,
            ]);

        $response->assertStatus(201)
            ->assertJsonFragment([
                'user_id'   => $user->id,
                'title'     => "Tomorrow's Plan",
                'content'   => "- [ ] Morning run\n- [ ] Finish essay",
                'plan_date' => '2026-11-28',
                'is_pinned' => true,
            ]);

        $this->assertDatabaseHas('plans', [
            'user_id'   => $user->id,
            'title'     => "Tomorrow's Plan",
            'is_pinned' => true,
        ]);
    }

    public function test_user_can_create_undated_freeform_note(): void
    {
        [$user, $token] = $this->actingAsUser();

        $response = $this->withHeaders($this->authHeader($token))
            ->postJson('/api/plans', [
                'title'   => 'Brain dump',
                'content' => 'Ideas for next month.',
            ]);

        $response->assertStatus(201)
            ->assertJsonFragment([
                'user_id'   => $user->id,
                'title'     => 'Brain dump',
                'plan_date' => null,
                'is_pinned' => false,
            ]);
    }

    public function test_validation_rejects_missing_title_bad_date_and_prohibited_user_id(): void
    {
        [$user, $token] = $this->actingAsUser();

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/plans', ['content' => 'No title'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['title']);

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/plans', [
                'title'     => 'Bad date',
                'plan_date' => '28-11-2026',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['plan_date']);

        $this->withHeaders($this->authHeader($token))
            ->postJson('/api/plans', [
                'title'   => 'Spoof',
                'user_id' => $user->id + 1,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['user_id']);
    }

    public function test_index_returns_only_authenticated_users_plans_ordered_by_pin_and_optional_date(): void
    {
        [$user, $token]  = $this->actingAsUser();
        [$other]         = $this->actingAsUser();

        $unpinned = $user->plans()->create([
            'title'     => 'Today notes',
            'plan_date' => '2026-11-27',
            'is_pinned' => false,
        ]);
        $pinned = $user->plans()->create([
            'title'     => 'Pinned roadmap',
            'plan_date' => '2026-11-28',
            'is_pinned' => true,
        ]);
        $other->plans()->create([
            'title' => 'Secret note',
        ]);

        $response = $this->withHeaders($this->authHeader($token))
            ->getJson('/api/plans')
            ->assertStatus(200);

        $data = $response->json();
        $this->assertCount(2, $data);
        $this->assertSame($pinned->id, $data[0]['id']);
        $this->assertSame($unpinned->id, $data[1]['id']);

        $filtered = $this->withHeaders($this->authHeader($token))
            ->getJson('/api/plans?date=2026-11-28')
            ->assertStatus(200)
            ->json();

        $this->assertCount(1, $filtered);
        $this->assertSame($pinned->id, $filtered[0]['id']);
    }

    public function test_user_can_show_update_and_delete_own_plan(): void
    {
        [$user, $token] = $this->actingAsUser();
        $plan = $user->plans()->create([
            'title'   => 'Draft',
            'content' => 'Initial text',
        ]);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/plans/{$plan->id}")
            ->assertStatus(200)
            ->assertJsonFragment(['title' => 'Draft']);

        $this->withHeaders($this->authHeader($token))
            ->patchJson("/api/plans/{$plan->id}", [
                'title'     => 'Updated Plan',
                'content'   => 'Step 1, Step 2',
                'plan_date' => '2026-11-28',
                'is_pinned' => true,
            ])
            ->assertStatus(200)
            ->assertJsonFragment([
                'title'     => 'Updated Plan',
                'content'   => 'Step 1, Step 2',
                'plan_date' => '2026-11-28',
                'is_pinned' => true,
            ]);

        $this->withHeaders($this->authHeader($token))
            ->deleteJson("/api/plans/{$plan->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('plans', ['id' => $plan->id]);
    }

    public function test_user_cannot_access_or_modify_another_users_plan(): void
    {
        [, $token] = $this->actingAsUser();
        [$other]   = $this->actingAsUser();
        $plan      = $other->plans()->create(['title' => 'Other plan']);

        $this->withHeaders($this->authHeader($token))
            ->getJson("/api/plans/{$plan->id}")
            ->assertStatus(403);

        $this->withHeaders($this->authHeader($token))
            ->patchJson("/api/plans/{$plan->id}", ['title' => 'Hacked'])
            ->assertStatus(403);

        $this->withHeaders($this->authHeader($token))
            ->deleteJson("/api/plans/{$plan->id}")
            ->assertStatus(403);
    }
}
