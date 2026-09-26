<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\TestCase;

/**
 * Creating the repository the New project wizard offers to make.
 *
 * The point of these is that a person's switch reaches GitHub with exactly the
 * repository they asked for and nothing else, and that every way GitHub can say
 * no comes back as a sentence the wizard can show.
 */
class GithubRepositoryCreateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true]);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'owner'), 'device_name' => 'Mac']);
        // Seeded directly: `Installs::connect` proves the token against GitHub
        // first, which is a different story from the one under test here.
        DB::table('vibes_integration_installs')->insert([
            'user_id' => $user->id, 'integration' => 'github',
            'credential' => Crypt::encryptString('gho_fixture'), 'account_label' => 'octocat',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->withToken('owner');
    }

    public function test_it_creates_the_repository_and_returns_where_it_went(): void
    {
        Http::fake(['api.github.com/user/repos' => Http::response([
            'full_name' => 'octocat/my-app',
            'html_url' => 'https://github.com/octocat/my-app',
            'clone_url' => 'https://github.com/octocat/my-app.git',
            'default_branch' => 'main',
        ], 201)]);

        $this->postJson('/api/connectors/github/repositories', ['name' => 'my-app', 'private' => true])
            ->assertOk()
            ->assertJson([
                'fullName' => 'octocat/my-app',
                'cloneUrl' => 'https://github.com/octocat/my-app.git',
                'defaultBranch' => 'main',
            ]);

        Http::assertSent(function ($request) {
            // An empty repository: the computer already has the first commit, so
            // an auto-init would make the first push a conflict.
            return $request->url() === 'https://api.github.com/user/repos'
                && $request['name'] === 'my-app'
                && $request['private'] === true
                && $request['auto_init'] === false
                && $request->hasHeader('Authorization', 'Bearer gho_fixture');
        });
    }

    public function test_a_name_github_would_reject_never_leaves_this_server(): void
    {
        Http::fake();
        $this->postJson('/api/connectors/github/repositories', ['name' => 'not a name/../etc'])
            ->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_a_name_already_taken_is_explained_rather_than_retried(): void
    {
        Http::fake(['api.github.com/user/repos' => Http::response(['message' => 'Repository creation failed.'], 422)]);
        $this->postJson('/api/connectors/github/repositories', ['name' => 'my-app'])
            ->assertStatus(422)
            ->assertSee('already have a repository', false);
    }

    public function test_a_revoked_connection_says_to_reconnect(): void
    {
        Http::fake(['api.github.com/user/repos' => Http::response(['message' => 'Bad credentials'], 401)]);
        $this->postJson('/api/connectors/github/repositories', ['name' => 'my-app'])
            ->assertStatus(422)
            ->assertSee('Reconnect GitHub', false);
    }

    public function test_an_account_with_no_github_connection_is_told_to_connect_one(): void
    {
        $other = User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other'), 'device_name' => 'Mac']);
        Http::fake();
        $this->withToken('other')
            ->postJson('/api/connectors/github/repositories', ['name' => 'my-app'])
            ->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_signed_out_it_creates_nothing(): void
    {
        Http::fake();
        $this->withToken('nonsense')
            ->postJson('/api/connectors/github/repositories', ['name' => 'my-app'])
            ->assertStatus(401);
        Http::assertNothingSent();
    }
}
