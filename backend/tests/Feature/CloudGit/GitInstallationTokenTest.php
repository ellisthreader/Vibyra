<?php
namespace Tests\Feature\CloudGit;

use App\Services\CloudWorkspaces\Git\{GitRefused, InstallationTokens};
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Http;

class GitInstallationTokenTest extends CloudGitTestCase
{
    public function test_missing_setup_never_falls_back_to_owner_oauth(): void
    {
        $this->makeComputer(); $this->queueProject('octo/hello'); $this->connectGithub(); $this->fakeRepo();
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertStatus(409)
            ->assertJsonPath('code', 'github_app_not_configured')->assertJsonMissing(['password' => self::TOKEN]);
    }
    public function test_read_and_write_have_exact_scope_and_a_valid_signed_jwt(): void
    {
        $this->configureApp();
        foreach (['fetch' => 'read', 'push' => 'write'] as $op => $permission) {
            $out = app(InstallationTokens::class)->mint('octo/hello', $op);
            $this->assertSame(self::APP_TOKEN, $out['password']);
            $this->assertSame(now()->addHour()->toIso8601String(), $out['expiresAt']);
            Http::assertSent(function ($request) use ($permission) {
                if ($request->method() !== 'POST') return false;
                $jwt = substr($request->header('Authorization')[0], 7);
                [$header, $payload, $signature] = explode('.', $jwt);
                $decode = fn ($value) => base64_decode(strtr($value, '-_', '+/'));
                $claims = json_decode($decode($payload), true);
                $key = openssl_pkey_get_private(config('cloud_workspaces.github_app.private_key'));
                $this->assertSame(1, openssl_verify($header.'.'.$payload, $decode($signature), openssl_pkey_get_details($key)['key'], OPENSSL_ALGO_SHA256));
                $this->assertSame('RS256', json_decode($decode($header), true)['alg']);
                $this->assertSame('123', $claims['iss']);
                $this->assertSame(now()->timestamp - 60, $claims['iat']);
                $this->assertLessThanOrEqual(now()->timestamp + 600, $claims['exp']);
                return $request['repositories'] === ['hello'] && $request['permissions'] === ['contents' => $permission];
            });
        }
    }
    public function test_push_is_disabled_by_default_and_sends_no_request(): void
    {
        $this->configureApp(); config(['cloud_workspaces.github_app.push_enabled' => false]);
        $this->expectExceptionMessage('Cloud GitHub push is disabled');
        try { app(InstallationTokens::class)->mint('octo/hello', 'push'); }
        finally { Http::assertNothingSent(); }
    }
    public function test_suspended_or_all_repository_installations_are_refused_before_mint(): void
    {
        foreach ([['repository_selection' => 'all'], ['repository_selection' => 'selected', 'suspended_at' => '2026-10-01']] as $installation) {
            $this->configureApp(); Http::swap(new Factory());
            Http::fake(['api.github.com/repos/octo/hello/installation' => Http::response(['id' => 42, ...$installation])]);
            try { app(InstallationTokens::class)->mint('octo/hello', 'fetch'); $this->fail('Expected refusal'); }
            catch (GitRefused $e) { $this->assertSame('github_app_installation_required', $e->errorCode); }
            Http::assertSentCount(1);
        }
    }
    public function test_expired_broad_mismatched_or_overprivileged_tokens_are_never_returned(): void
    {
        $valid = ['token' => self::APP_TOKEN, 'expires_at' => now()->addHour()->toIso8601String(),
            'permissions' => ['contents' => 'read'], 'repositories' => [['full_name' => 'octo/hello']]];
        foreach ([['expires_at' => now()->subSecond()->toIso8601String()], ['expires_at' => 'invalid'],
            ['repositories' => [['full_name' => 'other/hello']]], ['repositories' => []],
            ['repositories' => [['full_name' => 'octo/hello'], ['full_name' => 'other/secret']]],
            ['permissions' => ['contents' => 'write']], ['permissions' => ['contents' => 'read', 'pull_requests' => 'write']],
            ['permissions' => ['contents' => 'read', 'metadata' => 'write']]] as $invalid) {
            $this->configureApp(); Http::swap(new Factory());
            Http::fake(['api.github.com/repos/octo/hello/installation' => Http::response(['id' => 42, 'repository_selection' => 'selected']),
                'api.github.com/app/installations/42/access_tokens' => Http::response([...$valid, ...$invalid])]);
            try { app(InstallationTokens::class)->mint('octo/hello', 'fetch'); $this->fail('Expected scope refusal'); }
            catch (GitRefused $e) { $this->assertSame('github_app_invalid_token', $e->errorCode); }
        }
    }
    public function test_provider_refusal_redirect_and_network_failure_are_fail_closed(): void
    {
        foreach ([401, 403, 404, 422, 302, 500] as $status) {
            $this->configureApp(); Http::swap(new Factory());
            Http::fake(['api.github.com/*' => Http::response([], $status)]);
            try { app(InstallationTokens::class)->mint('octo/hello', 'fetch'); $this->fail('Expected provider refusal'); }
            catch (GitRefused $e) { $this->assertContains($e->errorCode, ['github_app_installation_required', 'github_app_unavailable']); }
        }
        $this->configureApp(); Http::swap(new Factory()); Http::fake(fn () => throw new \Illuminate\Http\Client\ConnectionException('fixture'));
        $this->expectExceptionMessage('GitHub App access is unavailable');
        app(InstallationTokens::class)->mint('octo/hello', 'fetch');
    }
}
