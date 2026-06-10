<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\SecurityRoleAssignment;
use App\Models\User;
use App\Services\Auth\PrivilegedRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CrossAccountReviewerAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_DATABASE,
            'moderation.publish_reviewer_emails' => [],
        ]);
    }

    public function test_ordinary_user_cannot_review_another_users_project(): void
    {
        [, $owner] = $this->authenticatedUser('owner@example.com');
        [$attackerToken] = $this->authenticatedUser('attacker@example.com');
        $project = $this->underReviewProject($owner);

        $this->postJson("/api/projects/{$project->slug}/review", [
            'decision' => PublishedProject::REVIEW_APPROVED,
        ], $this->auth($attackerToken))
            ->assertForbidden();

        $this->assertSame(PublishedProject::REVIEW_UNDER_REVIEW, $project->fresh()->review_status);
        $this->assertNull($project->fresh()->reviewed_by_user_id);
    }

    public function test_assigned_reviewer_can_review_another_users_project(): void
    {
        [, $owner] = $this->authenticatedUser('owner@example.com');
        [$reviewerToken, $reviewer] = $this->authenticatedUser('reviewer@example.com');
        $project = $this->underReviewProject($owner);
        app(PrivilegedRoleService::class)->grant($reviewer, SecurityRoleAssignment::ROLE_REVIEWER);

        $this->postJson("/api/projects/{$project->slug}/review", [
            'decision' => PublishedProject::REVIEW_DENIED,
            'reason' => 'Unsafe behavior confirmed.',
        ], $this->auth($reviewerToken))
            ->assertOk()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);

        $this->assertSame($reviewer->id, $project->fresh()->reviewed_by_user_id);
    }

    /**
     * @return array{0: string, 1: User}
     */
    private function authenticatedUser(string $email): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Authorization User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        return [$token, User::where('email', $email)->firstOrFail()];
    }

    private function underReviewProject(User $owner): PublishedProject
    {
        return PublishedProject::query()->create([
            'user_id' => $owner->id,
            'source_project_id' => 'cross-account-project',
            'slug' => 'cross-account-project',
            'title' => 'Cross Account Project',
            'description' => 'Pending manual review.',
            'stack' => 'App',
            'tags' => [],
            'visibility' => 'private',
            'review_status' => PublishedProject::REVIEW_UNDER_REVIEW,
            'review_flags' => [],
            'safety_rating' => 'caution',
            'safety_score' => 50,
        ]);
    }

    /**
     * @return array<string, string>
     */
    private function auth(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }
}
