<?php
/**
 * Local-only Laravel entry for scripts/e2e-cloud-computer.sh. Used both as the `php -S` router and as
 * `php scripts/e2e-cloud-computer-boot.php artisan <command>`. It NEVER reads backend/.env (so no real keys load) and
 * binds an in-memory FAKE cloud provider. It refuses to run unless APP_ENV is local/testing, a throwaway sqlite file
 * is named by E2E_DB, and the relay/API addresses are loopback. Nothing here is loaded by the real app.
 */
$env = getenv('APP_ENV') ?: '';
$db = getenv('E2E_DB') ?: '';
if (!in_array($env, ['local', 'testing'], true) || !str_contains($db, '/e2e-')) {
    fwrite(STDERR, "e2e boot refused: needs APP_ENV=local|testing and E2E_DB=<throwaway sqlite path containing /e2e->\n");
    http_response_code(500);
    exit(1);
}
$backend = dirname(__DIR__).'/backend';
define('LARAVEL_START', microtime(true));
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->loadEnvironmentFrom('/nonexistent-e2e.env');
$app->booted(function ($app) {
    abort_unless(in_array($app->environment(), ['local', 'testing'], true), 500);
    if (getenv('E2E_IDLE_SECONDS')) config(['cloud_workspaces.idle_seconds' => max(5, (int) getenv('E2E_IDLE_SECONDS'))]);
    if (getenv('E2E_FAKE_GITHUB')) {
        // GitHub URLs are hard-coded in the backend; a Http::fake limited to api.github.com stands in for it. Repo e2e/demo only.
        \Illuminate\Support\Facades\Http::fake(['api.github.com/*' => function ($request) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            if ($path === '/repos/e2e/demo') return \Illuminate\Support\Facades\Http::response(['default_branch' => 'main', 'private' => true, 'permissions' => ['push' => true]]);
            if ($path === '/repos/e2e/demo/pulls' && $request->method() === 'POST') return \Illuminate\Support\Facades\Http::response(['number' => 7, 'html_url' => 'https://github.com/e2e/demo/pull/7', 'changed_files' => 1, 'additions' => 2, 'deletions' => 0, 'commits' => 1], 201);
            if ($path === '/repos/e2e/demo/installation') return \Illuminate\Support\Facades\Http::response(['id' => 42, 'repository_selection' => 'selected', 'suspended_at' => null]);
            if ($path === '/app/installations/42/access_tokens' && $request->method() === 'POST') { $c = $request->data()['permissions']['contents'] ?? 'read';
                return \Illuminate\Support\Facades\Http::response(['token' => 'e2e-fake-github-token', 'expires_at' => now()->addHour()->toIso8601ZuluString(), 'repositories' => [['full_name' => 'e2e/demo']], 'permissions' => ['contents' => $c, 'metadata' => 'read']], 201); }
            return \Illuminate\Support\Facades\Http::response(['message' => 'Not Found'], 404);
        }]);
    }
    $app->instance(\App\Services\CloudWorkspaces\CloudWorkspaceProvider::class, new class implements \App\Services\CloudWorkspaces\CloudWorkspaceProvider {
        public function configure(object $w): array { return ['machine' => 'fake-machine', 'volume' => 'fake-volume']; }
        public function recover(object $w): ?array { return null; }
        public function inspect(object $w): string { return 'stopped'; }
        public function stop(object $w): void {}
        public function destroy(object $w): void {}
    });
});
if (PHP_SAPI === 'cli' && ($argv[1] ?? '') === 'artisan') {
    $argv = array_merge([$argv[0]], array_slice($argv, 2));
    $_SERVER['argv'] = $argv;
    exit($app->handleCommand(new Symfony\Component\Console\Input\ArgvInput($argv)));
}
if (PHP_SAPI === 'cli' && ($argv[1] ?? '') === 'run') {
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    require $argv[2];
    exit(0);
}
$app->handleRequest(Illuminate\Http\Request::capture());
