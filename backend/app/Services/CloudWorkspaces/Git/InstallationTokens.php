<?php
namespace App\Services\CloudWorkspaces\Git;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

/** Only exact-repository installation credentials may leave the control plane. */
final class InstallationTokens
{
    public function mint(string $repo, string $op): array
    {
        if (!preg_match(Branches::REPO, $repo)) throw new GitRefused('git_repository_invalid', 'Invalid GitHub repository.');
        if (!in_array($op, ['fetch', 'push'], true)) throw new GitRefused('git_operation_invalid', 'Unsupported git operation.');
        if ($op === 'push' && !config('cloud_workspaces.github_app.push_enabled')) {
            throw new GitRefused('github_app_push_disabled', 'Cloud GitHub push is disabled pending repository rules.', 409);
        }
        $jwt = $this->jwt();
        $installation = $this->request($jwt, 'get', '/repos/'.$repo.'/installation');
        if (!is_int($installation['id'] ?? null) || $installation['id'] < 1
            || ($installation['repository_selection'] ?? null) !== 'selected' || !empty($installation['suspended_at'])) {
            throw new GitRefused('github_app_installation_required', 'Install the Cloud GitHub App on selected repositories only.', 409);
        }
        $permissions = ['contents' => $op === 'push' ? 'write' : 'read'];
        // Names are scoped to this installation; GitHub rejects any repository not installed.
        $name = explode('/', $repo)[1];
        $data = $this->request($jwt, 'post', '/app/installations/'.$installation['id'].'/access_tokens',
            ['repositories' => [$name], 'permissions' => $permissions]);
        $repos = $data['repositories'] ?? [];
        $granted = $data['permissions'] ?? [];
        if (!is_string($data['token'] ?? null) || $data['token'] === '' || !is_string($data['expires_at'] ?? null)
            || !is_array($repos) || !is_array($granted) || count($repos) !== 1 || strtolower($repos[0]['full_name'] ?? '') !== strtolower($repo)
            || ($granted['contents'] ?? null) !== $permissions['contents']
            || array_diff_key($granted, ['contents' => true, 'metadata' => true])
            || (isset($granted['metadata']) && $granted['metadata'] !== 'read')) {
            throw new GitRefused('github_app_invalid_token', 'GitHub returned an unexpected credential scope.', 503);
        }
        try { $expires = Carbon::parse($data['expires_at']); }
        catch (\Throwable) { throw new GitRefused('github_app_invalid_token', 'GitHub returned an invalid credential expiry.', 503); }
        if ($expires->lte(now()) || $expires->gt(now()->addHour()->addMinute())) {
            throw new GitRefused('github_app_invalid_token', 'GitHub returned an invalid credential expiry.', 503);
        }
        return ['username' => 'x-access-token', 'password' => $data['token'], 'expiresAt' => $data['expires_at']];
    }

    private function jwt(): string
    {
        $id = config('cloud_workspaces.github_app.app_id');
        $pem = config('cloud_workspaces.github_app.private_key');
        if (!is_string($id) || !ctype_digit($id) || (int) $id < 1 || !is_string($pem) || $pem === '') {
            throw new GitRefused('github_app_not_configured', 'Cloud GitHub App setup is required.', 409);
        }
        $key = @openssl_pkey_get_private($pem);
        $details = $key ? openssl_pkey_get_details($key) : false;
        if (!$details || $details['type'] !== OPENSSL_KEYTYPE_RSA || $details['bits'] < 2048) {
            throw new GitRefused('github_app_not_configured', 'Cloud GitHub App signing key is invalid.', 409);
        }
        $encode = static fn ($value) => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
        $body = $encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])).'.'
            .$encode(json_encode(['iat' => now()->timestamp - 60, 'exp' => now()->timestamp + 540, 'iss' => $id]));
        if (!openssl_sign($body, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new GitRefused('github_app_not_configured', 'Cloud GitHub App signing failed.', 409);
        }
        return $body.'.'.$encode($signature);
    }

    private function request(string $jwt, string $method, string $path, array $body = []): array
    {
        try {
            $client = Http::withToken($jwt)->acceptJson()->timeout(10)->withOptions(['allow_redirects' => false])
                ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2026-03-10']);
            $response = $method === 'get' ? $client->get('https://api.github.com'.$path) : $client->post('https://api.github.com'.$path, $body);
        } catch (\Throwable) { throw new GitRefused('github_app_unavailable', 'GitHub App access is unavailable.', 503); }
        if (in_array($response->status(), [401, 403, 404, 422], true)) {
            throw new GitRefused('github_app_installation_required', 'Review the Cloud GitHub App installation and permissions.', 409);
        }
        if (!$response->successful() || !is_array($response->json())) {
            throw new GitRefused('github_app_unavailable', 'GitHub App access is unavailable.', 503);
        }
        return $response->json();
    }
}
