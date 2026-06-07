<?php

namespace App\Services\Deployments;

use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Throwable;

class RailwayRuntimeDeploymentService
{
    public function __construct(private mixed $runner = null) {}

    public function deploy(PublishedProjectDeployment $deployment): PublishedProjectDeployment
    {
        if ($deployment->provider !== PublishedProjectDeployment::PROVIDER_RAILWAY || $deployment->status !== PublishedProjectDeployment::STATUS_QUEUED) {
            return $deployment;
        }

        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_UPLOADING,
            'provider_status' => 'uploading_source',
            'last_error' => null,
        ])->save();

        $workdir = storage_path('app/runtime-deployments/'.$deployment->id.'-'.Str::random(8));

        try {
            $this->writeSourceBundle($deployment, $workdir);
            $this->writeRailwayConfig($deployment, $workdir);
            $projectName = $this->projectName($deployment);
            $upload = $this->runRailway($this->uploadArguments($deployment), $workdir, 900);

            if (! $upload['ok']) {
                return $this->markFailed($deployment, 'Railway upload failed.', $upload['output']);
            }

            $deployment->forceFill([
                'status' => PublishedProjectDeployment::STATUS_BUILDING,
                'provider_status' => 'uploaded',
                'latest_logs_summary' => Str::limit($upload['output'], 1800, ''),
            ])->save();

            $status = $this->runRailway($this->statusArguments($deployment), $workdir, 120);
            if (! $status['ok']) {
                return $this->markFailed($deployment, 'Railway status lookup failed.', $status['output']);
            }

            $statusPayload = $this->decodeJsonPayload($status['output']);
            $statusProjectId = $this->firstProjectId($statusPayload);
            $projectId = $deployment->provider_project_id ?: $statusProjectId;
            $serviceId = $deployment->provider_service_id ?: $this->firstServiceId($statusPayload);
            $serviceName = $this->firstServiceName($statusPayload);
            $url = $statusProjectId && $statusProjectId === $projectId ? $this->firstRailwayUrl($statusPayload) : null;

            if (! $projectId || ! ($serviceId || $serviceName)) {
                $listed = $this->findListedProjectTarget($projectName);
                $projectId = $projectId ?: ($listed['projectId'] ?? null);
                $serviceId = $serviceId ?: ($listed['serviceId'] ?? null);
                $serviceName = $serviceName ?: ($listed['serviceName'] ?? null);
            }

            if (! $url && ($projectId || $serviceId || $serviceName)) {
                $domainArgs = ['domain', '--json', '--environment', $this->environmentName()];
                if ($projectId) {
                    array_push($domainArgs, '--project', $projectId);
                }
                if ($serviceId || $serviceName) {
                    array_push($domainArgs, '--service', $serviceId ?: $serviceName);
                }
                $domain = $this->runRailway($domainArgs, $workdir, 120);
                if ($domain['ok']) {
                    $url = $this->firstRailwayUrl($this->decodeJsonPayload($domain['output'])) ?: $this->firstRailwayUrl($domain['output']);
                }
            }

            if (! $this->isSafePublicUrl($url)) {
                return $this->markFailed($deployment, 'Railway did not return a public HTTPS demo URL.', $status['output']);
            }

            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_STARTING,
                'provider_status' => 'starting',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
            ])->save();

            if (! $this->waitForPublicDemoUrl($url)) {
                return $this->markFailed($deployment, 'Railway demo URL did not become reachable.', $status['output']);
            }

            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_LIVE,
                'provider_status' => 'live',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
                'hosted_at' => now(),
            ])->save();
        } catch (Throwable $error) {
            return $this->markFailed($deployment, $error->getMessage(), '');
        } finally {
            File::deleteDirectory($workdir);
        }

        return $deployment;
    }

    private function writeSourceBundle(PublishedProjectDeployment $deployment, string $workdir): void
    {
        File::ensureDirectoryExists($workdir);
        $files = is_array($deployment->demo_files) ? $deployment->demo_files : [];
        foreach ($files as $file) {
            $path = $this->safeRelativePath((string) ($file['path'] ?? ''));
            if ($path === '') {
                continue;
            }
            $target = $workdir.'/'.$path;
            File::ensureDirectoryExists(dirname($target));
            $body = (string) ($file['body'] ?? '');
            if (($file['encoding'] ?? 'utf8') === 'base64') {
                $body = base64_decode($body, true) ?: '';
            }
            File::put($target, $body);
        }
        $this->writeLaravelRuntimeDirectories($deployment, $workdir);
    }

    private function writeLaravelRuntimeDirectories(PublishedProjectDeployment $deployment, string $workdir): void
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel') {
            return;
        }

        $cacheDirectory = $workdir.'/bootstrap/cache';
        File::ensureDirectoryExists($cacheDirectory);
        if (! File::exists($cacheDirectory.'/.gitignore')) {
            File::put($cacheDirectory.'/.gitignore', "*\n!.gitignore\n");
        }
    }

    private function writeRailwayConfig(PublishedProjectDeployment $deployment, string $workdir): void
    {
        $this->writeDemoRuntimeEnv($deployment, $workdir);
        $this->writeLaravelProxyBootstrap($deployment, $workdir);
        $start = trim((string) $deployment->start_command);
        $build = trim((string) $deployment->build_command);
        if (($start === '' && $build === '') || File::exists($workdir.'/railway.json')) {
            return;
        }
        $config = [
            'build' => ['builder' => 'NIXPACKS'],
            'deploy' => [
                'restartPolicyType' => 'ON_FAILURE',
                'restartPolicyMaxRetries' => 3,
            ],
        ];
        if ($build !== '') {
            $config['build']['buildCommand'] = $build;
        }
        if ($start !== '') {
            $config['deploy']['startCommand'] = $this->runtimeStartCommand($deployment, $start);
        }
        File::put($workdir.'/railway.json', json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    private function runtimeStartCommand(PublishedProjectDeployment $deployment, string $start): string
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel') {
            return $start;
        }

        $prepare = 'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs';
        if (str_contains($start, $prepare)) {
            return $start;
        }

        return $prepare.' && '.$start;
    }

    private function writeDemoRuntimeEnv(PublishedProjectDeployment $deployment, string $workdir): void
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel' || File::exists($workdir.'/.env')) {
            return;
        }

        File::put($workdir.'/.env', implode("\n", [
            'APP_NAME="Vibyra Demo"',
            'APP_ENV=production',
            'APP_KEY=base64:'.base64_encode(random_bytes(32)),
            'APP_DEBUG=false',
            'LOG_CHANNEL=stderr',
            'SESSION_DRIVER=file',
            'CACHE_STORE=file',
            'QUEUE_CONNECTION=sync',
            'DB_CONNECTION=sqlite',
            'DB_DATABASE=/tmp/vibyra-demo.sqlite',
            '',
        ]));
    }

    private function writeLaravelProxyBootstrap(PublishedProjectDeployment $deployment, string $workdir): void
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel') {
            return;
        }

        $indexPath = $workdir.'/public/index.php';
        if (! File::exists($indexPath)) {
            return;
        }

        $marker = '// Vibyra Railway HTTPS proxy normalization.';
        $contents = File::get($indexPath);
        if (str_contains($contents, $marker)) {
            return;
        }

        $bootstrap = <<<'PHP'

// Vibyra Railway HTTPS proxy normalization.
$forwardedProto = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
if ($forwardedProto === 'https') {
    $_SERVER['HTTPS'] = 'on';
    $_SERVER['SERVER_PORT'] = '443';
    $_SERVER['REQUEST_SCHEME'] = 'https';
}
unset($forwardedProto);

PHP;

        $patched = preg_replace('/^<\?php\s*/', "<?php\n".$bootstrap, $contents, 1, $count);
        if ($count === 1 && is_string($patched)) {
            File::put($indexPath, $patched);
        }
    }

    private function runRailway(array $arguments, string $cwd, int $timeoutSeconds): array
    {
        if (is_callable($this->runner)) {
            return ($this->runner)($arguments, $cwd, $timeoutSeconds);
        }

        $command = [(string) config('services.railway.cli_path', 'railway'), ...$arguments];
        $process = new Process($command, $cwd, $this->railwayEnv(), null, $timeoutSeconds);
        $process->run();

        return [
            'ok' => $process->isSuccessful(),
            'output' => trim($process->getOutput()."\n".$process->getErrorOutput()),
        ];
    }

    private function withWorkspace(array $arguments): array
    {
        $workspace = trim((string) config('services.railway.team_id', ''));

        return $workspace === '' ? $arguments : [...$arguments, '--workspace', $workspace];
    }

    private function waitForPublicDemoUrl(string $url): bool
    {
        if (is_callable($this->runner)) {
            return true;
        }

        $deadline = time() + max(5, (int) config('services.railway.runtime_ready_timeout', 180));
        do {
            if ($this->publicDemoUrlReady($url)) {
                return true;
            }
            sleep(min(8, max(1, $deadline - time())));
        } while (time() < $deadline);

        return $this->publicDemoUrlReady($url);
    }

    private function publicDemoUrlReady(string $url): bool
    {
        try {
            $response = Http::timeout(8)->get($url);
        } catch (Throwable) {
            return false;
        }

        return $response->status() >= 200
            && $response->status() < 400
            && ! $this->hasInsecureSameHostAssets($response->body(), (string) $response->header('Link'), $url);
    }

    private function hasInsecureSameHostAssets(string $body, string $linkHeader, string $publicUrl): bool
    {
        $host = strtolower((string) parse_url($publicUrl, PHP_URL_HOST));
        if ($host === '') {
            return false;
        }

        $sameHostHttpUrl = '~http://'.preg_quote($host, '~').'(?::\d+)?(?:[/\s"\'<>;,]|$)~i';

        return preg_match($sameHostHttpUrl, $body) === 1
            || preg_match($sameHostHttpUrl, $linkHeader) === 1
            || str_contains($body, '${RAILWAY_PUBLIC_DOMAIN}')
            || str_contains($linkHeader, '${RAILWAY_PUBLIC_DOMAIN}');
    }

    private function uploadArguments(PublishedProjectDeployment $deployment): array
    {
        if ($deployment->provider_project_id && $deployment->provider_service_id) {
            return $this->withWorkspace([
                'up',
                '--project',
                $deployment->provider_project_id,
                '--service',
                $deployment->provider_service_id,
                '--environment',
                $this->environmentName(),
                '--detach',
                '--json',
                '--yes',
            ]);
        }

        return $this->withWorkspace([
            'up',
            '--new',
            '--name',
            $this->projectName($deployment),
            '--environment',
            $this->environmentName(),
            '--detach',
            '--json',
            '--yes',
        ]);
    }

    private function statusArguments(PublishedProjectDeployment $deployment): array
    {
        return ['status', '--json'];
    }

    private function environmentName(): string
    {
        return trim((string) config('services.railway.runtime_environment', 'production')) ?: 'production';
    }

    private function findListedProjectTarget(string $projectName): ?array
    {
        $list = $this->runRailway(['list', '--json'], base_path(), 120);
        if (! $list['ok']) {
            return null;
        }

        $payload = $this->decodeJsonPayload($list['output']);
        $projects = $this->projectList($payload);
        $workspace = trim((string) config('services.railway.team_id', ''));
        $matches = [];
        foreach ($projects as $project) {
            if (! is_array($project) || (string) ($project['name'] ?? '') !== $projectName) {
                continue;
            }
            if ($workspace !== '' && (string) data_get($project, 'workspace.id') !== $workspace) {
                continue;
            }
            $matches[] = $project;
        }
        usort($matches, fn ($a, $b) => strcmp((string) ($b['createdAt'] ?? ''), (string) ($a['createdAt'] ?? '')));
        $project = $matches[0] ?? null;
        if (! is_array($project)) {
            return null;
        }

        return [
            'projectId' => $this->firstString($project, ['id'], fn ($path) => $path === 'id'),
            'serviceId' => $this->firstServiceId($project),
            'serviceName' => $this->firstServiceName($project),
        ];
    }

    private function projectList(mixed $payload): array
    {
        if (! is_array($payload)) {
            return [];
        }
        if (array_is_list($payload)) {
            return $payload;
        }
        $projects = $payload['projects'] ?? [];

        return is_array($projects) ? $projects : [];
    }

    private function railwayEnv(): array
    {
        $env = [];
        $token = (string) config('services.railway.api_token', '');
        if ($token !== '') {
            $env['RAILWAY_TOKEN'] = $token;
        }

        return $env;
    }

    private function markFailed(PublishedProjectDeployment $deployment, string $message, string $logs): PublishedProjectDeployment
    {
        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_FAILED,
            'provider_status' => 'failed',
            'last_error' => Str::limit($message, 900, ''),
            'latest_logs_summary' => Str::limit($logs, 1800, ''),
        ])->save();

        return $deployment;
    }

    private function projectName(PublishedProjectDeployment $deployment): string
    {
        $prefix = Str::slug((string) config('services.railway.runtime_project_prefix', 'vibyra-demo')) ?: 'vibyra-demo';

        return $prefix.'-'.$deployment->id;
    }

    private function decodeJsonPayload(string $output): mixed
    {
        $trimmed = trim($output);
        $decoded = json_decode($trimmed, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }

        foreach (array_reverse(preg_split('/\R/', $trimmed) ?: []) as $line) {
            $decoded = json_decode(trim($line), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return $output;
    }

    private function firstServiceId(mixed $payload): ?string
    {
        return $this->walk($payload, function ($value, string $key, string $path) {
            if (! is_string($value)) {
                return null;
            }
            if ($key === 'serviceId' && str_contains($path, 'serviceInstances.edges')) {
                return $value;
            }
            if ($key === 'id' && str_contains($path, 'services.edges') && ! str_contains($path, 'latestDeployment')) {
                return $value;
            }

            return null;
        });
    }

    private function firstProjectId(mixed $payload): ?string
    {
        return $this->firstString($payload, ['id'], fn ($path) => $path === 'id' || $path === 'project.id');
    }

    private function firstServiceName(mixed $payload): ?string
    {
        return $this->firstString($payload, ['serviceName', 'name'], fn ($path) => str_contains($path, 'services.edges') || str_contains($path, 'serviceInstances.edges'));
    }

    private function firstDeploymentId(mixed $payload): ?string
    {
        return $this->firstString($payload, ['deploymentId', 'id'], fn ($path) => str_contains($path, 'latestDeployment') || str_contains($path, 'activeDeployments'));
    }

    private function firstRailwayUrl(mixed $payload): ?string
    {
        if (is_string($payload)) {
            if (preg_match('/https:\/\/[a-z0-9.-]+\.up\.railway\.app[^\s"\'<>]*/i', $payload, $match) === 1) {
                return $match[0];
            }
            if (preg_match('/\b([a-z0-9.-]+\.up\.railway\.app)\b/i', $payload, $match) === 1) {
                return 'https://'.$match[1];
            }

            return null;
        }

        return $this->walk($payload, function ($value) {
            if (! is_string($value)) {
                return null;
            }

            return $this->firstRailwayUrl($value);
        });
    }

    private function firstString(mixed $payload, array $keys, ?callable $pathFilter = null): ?string
    {
        return $this->walk($payload, function ($value, string $key, string $path) use ($keys, $pathFilter) {
            if (! is_string($value) || ! in_array($key, $keys, true)) {
                return null;
            }
            if ($pathFilter && ! $pathFilter($path)) {
                return null;
            }

            return $value;
        });
    }

    private function walk(mixed $value, callable $callback, string $key = '', string $path = ''): mixed
    {
        $result = $callback($value, $key, $path);
        if ($result !== null) {
            return $result;
        }
        if (! is_array($value)) {
            return null;
        }
        foreach ($value as $childKey => $child) {
            $result = $this->walk($child, $callback, (string) $childKey, $path === '' ? (string) $childKey : $path.'.'.$childKey);
            if ($result !== null) {
                return $result;
            }
        }

        return null;
    }

    private function safeRelativePath(string $path): string
    {
        $path = trim(str_replace('\\', '/', $path), '/');
        $parts = array_values(array_filter(explode('/', $path), fn ($part) => $part !== '' && $part !== '.'));
        if ($parts === [] || in_array('..', $parts, true)) {
            return '';
        }

        return implode('/', $parts);
    }

    private function isSafePublicUrl(?string $url): bool
    {
        if (! $url || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $scheme === 'https' && $host !== '' && ! preg_match('/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/i', $host);
    }
}
