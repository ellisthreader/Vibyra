<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Account\AccountDeletion;
use App\Services\Account\StripeSubscriptionCancellation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class AccountDeletionCleanupTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_deletion_routes_keep_session_auth_and_csrf_middleware(): void
    {
        foreach (['/web-api/account', '/web-api/account/provider/google/start'] as $uri) {
            $route = Route::getRoutes()->match(\Illuminate\Http\Request::create($uri,
                $uri === '/web-api/account' ? 'DELETE' : 'POST'));
            $this->assertContains('web', $route->gatherMiddleware());
            $this->assertContains('auth', $route->gatherMiddleware());
        }
    }

    public function test_web_deletion_requires_reauthentication_and_purges_user_content(): void
    {
        Storage::fake('deletion-test');
        config(['vibes.attachments_disk' => 'deletion-test']);
        $user = User::factory()->create(['password' => Hash::make('secret123')]);
        $other = User::factory()->create();
        $project = DB::table('published_projects')->insertGetId([
            'user_id' => $other->id, 'slug' => 'someone-else', 'title' => 'Someone else',
            'description' => 'A project', 'visibility' => 'public',
            'comments_count' => 1, 'likes_count' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $ownedProject = DB::table('published_projects')->insertGetId([
            'user_id' => $user->id, 'slug' => 'to-retire', 'title' => 'Mine',
            'description' => 'Hosted project', 'visibility' => 'public',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('published_project_deployments')->insert([
            'published_project_id' => $ownedProject, 'user_id' => $user->id,
            'provider' => 'railway', 'provider_project_id' => 'railway-demo-123',
            'status' => 'ready', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('published_project_comments')->insert([
            'published_project_id' => $project, 'user_id' => $user->id,
            'body' => 'My personal comment', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('published_project_reactions')->insert([
            'published_project_id' => $project, 'user_id' => $user->id,
            'type' => 'like', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('published_project_reports')->insert([
            'published_project_id' => $project, 'reporter_user_id' => $user->id,
            'reason' => 'other', 'details' => 'My private report',
            'screenshot_data_url' => 'data:image/png;base64,abc',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('analytics_consents')->insert([
            'user_id' => $user->id, 'surface' => 'mobile', 'subject_hash' => str_repeat('a', 64),
            'choice' => 'allowed', 'policy_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('analytics_events')->insert([
            'event_id' => (string) Str::uuid(), 'user_id' => $user->id,
            'surface' => 'mobile', 'event' => 'test', 'occurred_at' => now(),
            'created_at' => now(),
        ]);
        DB::table('membership_owners')->insert([
            'reference' => 'test-payment', 'user_id' => $user->id,
        ]);
        $path = 'vibes-attachments/'.$user->id.'/'.Str::uuid();
        Storage::disk('deletion-test')->put($path, 'private attachment');
        DB::table('vibes_attachments')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $user->id,
            'kind' => 'text', 'mime' => 'text/plain', 'name' => 'private.txt',
            'bytes' => 18, 'tokens' => 5, 'path' => $path,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->deleteJson('/web-api/account', ['password' => 'secret123'])->assertUnauthorized();
        $this->actingAs($user)->deleteJson('/web-api/account', ['password' => 'wrong'])
            ->assertUnauthorized();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->deleteJson('/web-api/account', ['password' => 'secret123'])
            ->assertOk()->assertJsonPath('cleanupPending', false);

        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('vibes_attachments', ['user_id' => $user->id]);
        Storage::disk('deletion-test')->assertMissing($path);
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $user->id, 'status' => 'complete']);
        $this->assertDatabaseMissing('published_project_comments', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('published_project_reactions', ['user_id' => $user->id]);
        $this->assertDatabaseHas('published_projects', ['id' => $project, 'comments_count' => 0, 'likes_count' => 0]);
        $this->assertDatabaseMissing('published_projects', ['id' => $ownedProject]);
        $this->assertDatabaseHas('published_project_runtime_cleanups', [
            'provider' => 'railway', 'provider_project_id' => 'railway-demo-123',
            'status' => 'pending', 'user_id' => null,
        ]);
        $this->assertDatabaseHas('published_project_reports', [
            'published_project_id' => $project, 'reporter_user_id' => null,
            'details' => null, 'screenshot_data_url' => null,
        ]);
        $this->assertDatabaseMissing('analytics_events', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('analytics_consents', ['user_id' => $user->id]);
        $this->assertDatabaseHas('membership_owners', ['reference' => 'test-payment', 'user_id' => null]);
    }

    public function test_storage_cleanup_is_retryable_and_idempotent(): void
    {
        Storage::fake('deletion-test');
        config(['vibes.attachments_disk' => 'deletion-test']);
        $user = User::factory()->create();
        $id = $user->id;
        $this->assertTrue(app(AccountDeletion::class)->delete($user));
        $this->assertTrue(app(AccountDeletion::class)->cleanPending($id));

        $path = 'vibes-attachments/'.$id.'/late-file';
        Storage::disk('deletion-test')->put($path, 'orphan');
        DB::table('account_deletion_cleanups')->where('user_id', $id)->update([
            'status' => 'pending', 'next_attempt_at' => now(), 'completed_at' => null,
        ]);
        $this->artisan('vibyra:cleanup-deleted-accounts')->assertSuccessful();
        Storage::disk('deletion-test')->assertMissing($path);
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $id, 'status' => 'complete']);
    }

    public function test_stripe_cancellation_survives_account_deletion_and_retries(): void
    {
        Storage::fake('deletion-test');
        config(['vibes.attachments_disk' => 'deletion-test']);
        $user = User::factory()->create(['stripe_subscription_id' => 'sub_example']);
        $id = $user->id;
        $canceller = \Mockery::mock(StripeSubscriptionCancellation::class);
        $canceller->shouldReceive('cancel')->once()->with('sub_example')
            ->andThrow(new \RuntimeException('Temporary provider error'));
        app()->instance(StripeSubscriptionCancellation::class, $canceller);

        $this->assertFalse(app(AccountDeletion::class)->delete($user));
        $this->assertDatabaseMissing('users', ['id' => $id]);
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $id, 'status' => 'pending']);

        $canceller = \Mockery::mock(StripeSubscriptionCancellation::class);
        $canceller->shouldReceive('cancel')->once()->with('sub_example');
        app()->instance(StripeSubscriptionCancellation::class, $canceller);
        $this->assertTrue(app(AccountDeletion::class)->cleanPending($id));
        $this->assertDatabaseHas('account_deletion_cleanups', ['user_id' => $id,
            'status' => 'complete', 'stripe_subscription_ids' => '[]']);
    }
}
