<?php

namespace Tests\Feature;

use App\Models\SecurityRoleAssignment;
use App\Models\User;
use App\Services\Auth\PrivilegedRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewerAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unverified_user_cannot_gain_reviewer_access_by_changing_to_allowlisted_email(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Unverified User',
            'email' => 'ordinary@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/account/profile', [
            'name' => 'Unverified User',
            'email' => 'reviewer@example.com',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('user.emailVerified', false);

        $this->assertNull(User::where('email', 'reviewer@example.com')->firstOrFail()->email_verified_at);

        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$token}"])
            ->assertForbidden();
    }

    public function test_verified_allowlisted_reviewer_access_does_not_grant_another_user_access(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        $reviewerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        User::where('email', 'reviewer@example.com')->firstOrFail()->markEmailAsVerified();

        $otherToken = $this->postJson('/api/auth/signup', [
            'name' => 'Other User',
            'email' => 'other@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk();
        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$otherToken}"])
            ->assertForbidden();
    }

    public function test_bootstrapped_reviewer_keeps_privilege_after_email_change(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$token, $reviewer] = $this->verifiedUser('reviewer@example.com');

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertOk();

        $reviewer->forceFill([
            'email' => 'reviewer-renamed@example.com',
            'email_verified_at' => now(),
        ])->save();

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertOk();

        $this->assertDatabaseHas('security_role_assignments', [
            'user_id' => $reviewer->id,
            'role' => SecurityRoleAssignment::ROLE_REVIEWER,
            'grant_source' => 'email_bootstrap',
            'revoked_at' => null,
        ]);
    }

    public function test_reused_allowlisted_email_does_not_transfer_bootstrapped_privilege(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$originalToken, $original] = $this->verifiedUser('reviewer@example.com');
        $this->getJson('/api/projects/review-queue', $this->auth($originalToken))
            ->assertOk();

        $original->forceFill([
            'email' => 'former-reviewer@example.com',
            'provider_id' => 'former-reviewer@example.com',
            'email_verified_at' => now(),
        ])->save();

        [$replacementToken] = $this->verifiedUser('reviewer@example.com');

        $this->getJson('/api/projects/review-queue', $this->auth($replacementToken))
            ->assertForbidden();
        $this->getJson('/api/projects/review-queue', $this->auth($originalToken))
            ->assertOk();
    }

    public function test_deleted_reviewers_email_does_not_transfer_bootstrapped_privilege(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$originalToken, $original] = $this->verifiedUser('reviewer@example.com');
        $this->getJson('/api/projects/review-queue', $this->auth($originalToken))
            ->assertOk();
        $original->delete();

        [$replacementToken] = $this->verifiedUser('reviewer@example.com');

        $this->getJson('/api/projects/review-queue', $this->auth($replacementToken))
            ->assertForbidden();
        $this->assertDatabaseHas('security_role_assignments', [
            'user_id' => null,
            'role' => SecurityRoleAssignment::ROLE_REVIEWER,
            'grant_source' => 'email_bootstrap',
        ]);
    }

    public function test_database_mode_accepts_reviewer_and_admin_roles_without_email_matching(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_DATABASE,
            'moderation.publish_reviewer_emails' => [],
        ]);

        [$reviewerToken, $reviewer] = $this->verifiedUser('assigned-reviewer@example.com');
        [$adminToken, $admin] = $this->verifiedUser('assigned-admin@example.com');
        $roles = app(PrivilegedRoleService::class);
        $roles->grant($reviewer, SecurityRoleAssignment::ROLE_REVIEWER, $admin);
        $roles->grant($admin, SecurityRoleAssignment::ROLE_ADMIN, $admin);

        $this->getJson('/api/projects/review-queue', $this->auth($reviewerToken))
            ->assertOk();
        $this->getJson('/api/projects/review-queue', $this->auth($adminToken))
            ->assertOk();

        $this->assertDatabaseHas('security_role_assignments', [
            'user_id' => $reviewer->id,
            'role' => SecurityRoleAssignment::ROLE_REVIEWER,
            'granted_by_user_id' => $admin->id,
            'grant_source' => 'manual',
            'revoked_at' => null,
        ]);
    }

    public function test_database_mode_ignores_verified_email_allowlist(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_DATABASE,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$token] = $this->verifiedUser('reviewer@example.com');

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertForbidden();
        $this->assertDatabaseCount('security_role_assignments', 0);
    }

    public function test_legacy_mode_allows_verified_email_without_creating_assignment(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_LEGACY,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$token] = $this->verifiedUser('reviewer@example.com');

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertOk();
        $this->assertDatabaseCount('security_role_assignments', 0);
    }

    public function test_revoked_role_cannot_be_restored_through_bootstrap_email(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$token, $reviewer] = $this->verifiedUser('reviewer@example.com');
        $roles = app(PrivilegedRoleService::class);

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertOk();
        $this->assertTrue($roles->revoke($reviewer, SecurityRoleAssignment::ROLE_REVIEWER, null, 'access_removed'));

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertForbidden();

        $this->assertDatabaseHas('security_role_assignments', [
            'user_id' => $reviewer->id,
            'role' => SecurityRoleAssignment::ROLE_REVIEWER,
            'revocation_reason' => 'access_removed',
        ]);
    }

    public function test_bootstrap_does_not_reactivate_manually_revoked_reviewer_role(): void
    {
        config([
            'moderation.privileged_role_mode' => PrivilegedRoleService::MODE_DATABASE,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);

        [$token, $reviewer] = $this->verifiedUser('reviewer@example.com');
        $roles = app(PrivilegedRoleService::class);
        $roles->grant($reviewer, SecurityRoleAssignment::ROLE_REVIEWER);
        $roles->revoke($reviewer, SecurityRoleAssignment::ROLE_REVIEWER, null, 'manual_revocation');

        config(['moderation.privileged_role_mode' => PrivilegedRoleService::MODE_BOOTSTRAP]);

        $this->getJson('/api/projects/review-queue', $this->auth($token))
            ->assertForbidden();
        $this->assertDatabaseHas('security_role_assignments', [
            'user_id' => $reviewer->id,
            'role' => SecurityRoleAssignment::ROLE_REVIEWER,
            'revocation_reason' => 'manual_revocation',
        ]);
    }

    /**
     * @return array{0: string, 1: User}
     */
    private function verifiedUser(string $email): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Authorization User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $user = User::where('email', $email)->firstOrFail();
        $user->markEmailAsVerified();

        return [$token, $user];
    }

    /**
     * @return array<string, string>
     */
    private function auth(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }
}
