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
    private const GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';

    private const MAX_RUNTIME_BUNDLE_BYTES = 10_000_000;

    private const MAX_RUNTIME_BUNDLE_FILES = 320;

    private string $lastRailwayError = '';

    public function __construct(private mixed $runner = null) {}

    public function deploy(PublishedProjectDeployment $deployment): PublishedProjectDeployment
    {
        if ($deployment->provider !== PublishedProjectDeployment::PROVIDER_RAILWAY || $deployment->status !== PublishedProjectDeployment::STATUS_QUEUED) {
            return $deployment;
        }

        $claimed = PublishedProjectDeployment::query()
            ->whereKey($deployment->id)
            ->where('status', PublishedProjectDeployment::STATUS_QUEUED)
            ->update([
                'status' => PublishedProjectDeployment::STATUS_UPLOADING,
                'provider_status' => 'uploading_source',
                'last_error' => null,
                'updated_at' => now(),
            ]);
        if ($claimed !== 1) {
            return $deployment->fresh();
        }
        $deployment = $deployment->fresh();

        if ((int) config('services.railway.max_active_demos_per_user', 1) <= 0) {
            return $this->markStopped($deployment, 'Runtime demos are disabled for this account.');
        }

        $bundleError = $this->validateSourceBundle($deployment);
        if ($bundleError !== null) {
            return $this->markFailed($deployment, $bundleError, $bundleError);
        }

        $workdir = storage_path('app/runtime-deployments/'.$deployment->id.'-'.Str::random(8));
        $archivePath = $workdir.'.tar.gz';
        $projectToken = null;
        $projectTokenName = null;
        $useCliUpload = is_callable($this->runner)
            || strtolower((string) config('services.railway.runtime_upload_mode', 'direct')) === 'cli';

        try {
            $this->writeSourceBundle($deployment, $workdir);
            $this->writeRailwayConfig($deployment, $workdir);

            if (! is_callable($this->runner)) {
                $target = $this->ensureIsolatedTarget($deployment);
                if (! $target) {
                    $detail = $this->lastRailwayError !== ''
                        ? ' Railway said: '.$this->lastRailwayError
                        : '';

                    return $this->markFailed(
                        $deployment,
                        'Railway isolated demo target could not be provisioned.'.$detail,
                        $this->lastRailwayError,
                    );
                }
                $deployment = $deployment->fresh();
                $projectTokenName = 'vibyra-runtime-'.$deployment->id.'-'.Str::lower(Str::random(8));
                $projectToken = $this->createProjectToken(
                    (string) $target['projectId'],
                    (string) $target['environmentId'],
                    $projectTokenName
                );
                if (! $projectToken) {
                    return $this->markFailed(
                        $deployment,
                        $this->withRailwayError('Railway project deployment token could not be created.'),
                        $this->lastRailwayError,
                    );
                }
            }

            $projectName = $this->projectName($deployment);
            $upload = $useCliUpload
                ? $this->runRailway($this->uploadArguments($deployment), $workdir, 900, $projectToken)
                : $this->uploadSourceArchive($deployment, $workdir, $archivePath, (string) $projectToken);

            if (! $upload['ok']) {
                return $this->markFailed(
                    $deployment,
                    $this->withProviderOutput('Railway upload failed.', $upload['output']),
                    $upload['output'],
                );
            }

            $uploadPayload = $this->decodeJsonPayload($upload['output']);
            $uploadedDeploymentId = $this->firstDeploymentId($uploadPayload);
            $deployment->forceFill([
                'status' => PublishedProjectDeployment::STATUS_BUILDING,
                'provider_status' => 'uploaded',
                'provider_deployment_id' => $uploadedDeploymentId,
                'latest_logs_summary' => Str::limit($upload['output'], 1800, ''),
            ])->save();

            $projectId = $deployment->provider_project_id;
            $serviceId = $deployment->provider_service_id;
            $serviceName = null;
            if (! $projectId || ! $serviceId) {
                $listed = $this->findListedProjectTarget($projectName);
                $projectId = $projectId ?: ($listed['projectId'] ?? null);
                $serviceId = $serviceId ?: ($listed['serviceId'] ?? null);
                $serviceName = $listed['serviceName'] ?? null;
            }
            if (! $projectId || ! ($serviceId || $serviceName)) {
                return $this->markFailed($deployment, 'Railway created the upload but its isolated demo target could not be resolved.', $upload['output']);
            }

            if ($useCliUpload) {
                $status = $this->runRailway($this->statusArguments($projectId, $serviceId ?: $serviceName), $workdir, 120, $projectToken);
                if (! $status['ok']) {
                    return $this->markFailed($deployment, 'Railway status lookup failed.', $status['output']);
                }
                $statusPayload = $this->decodeJsonPayload($status['output']);
                $domain = $this->runRailway([
                    'domain',
                    '--json',
                    '--environment',
                    $this->environmentName(),
                    '--project',
                    $projectId,
                    '--service',
                    $serviceId ?: $serviceName,
                ], $workdir, 120, $projectToken);
                $url = $domain['ok']
                    ? ($this->firstRailwayUrl($this->decodeJsonPayload($domain['output'])) ?: $this->firstRailwayUrl($domain['output']))
                    : null;
            } else {
                if (! $uploadedDeploymentId) {
                    return $this->markFailed($deployment, 'Railway upload did not return a deployment ID.', $upload['output']);
                }
                $status = $this->waitForRailwayDeployment($uploadedDeploymentId, $projectToken);
                if (! $status['ok']) {
                    return $this->markFailed(
                        $deployment,
                        $this->withProviderOutput('Railway deployment failed before becoming active.', $status['output']),
                        $status['output'],
                    );
                }
                $statusPayload = $this->decodeJsonPayload($status['output']);
                $url = $this->firstRailwayUrl($uploadPayload)
                    ?: $this->railwayServiceUrl(
                        (string) $projectId,
                        (string) data_get($deployment->metadata, 'providerEnvironmentId', ''),
                        (string) $serviceId,
                        $projectToken,
                    );
            }

            if (! $this->isSafePublicUrl($url)) {
                return $this->markFailed(
                    $deployment,
                    $this->withRailwayError('Railway did not return a public HTTPS demo URL.'),
                    $this->lastRailwayError ?: $status['output'],
                );
            }

            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $uploadedDeploymentId ?: $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_STARTING,
                'provider_status' => 'starting',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
            ])->save();

            if (! $this->waitForPublicDemoUrl($url, $deployment)) {
                return $this->markFailed($deployment, 'Railway demo URL did not become reachable.', $status['output']);
            }

            $deployment->forceFill([
                'provider_project_id' => $projectId,
                'provider_service_id' => $serviceId ?: $serviceName,
                'provider_deployment_id' => $uploadedDeploymentId ?: $this->firstDeploymentId($statusPayload),
                'status' => PublishedProjectDeployment::STATUS_LIVE,
                'provider_status' => 'live',
                'public_url' => $url,
                'latest_logs_summary' => Str::limit($status['output'], 1800, ''),
                'hosted_at' => now(),
            ])->save();
            app(RuntimeDemoLifecycleService::class)->retireReplacedAfterLive($deployment);
        } catch (Throwable $error) {
            return $this->markFailed($deployment, $error->getMessage(), '');
        } finally {
            if ($projectTokenName && $deployment->provider_project_id) {
                $this->deleteProjectToken((string) $deployment->provider_project_id, $projectTokenName);
            }
            File::deleteDirectory($workdir);
            File::delete($archivePath);
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
                $body = (string) base64_decode($body, true);
            }
            File::put($target, $body);
        }
        $this->writeLaravelRuntimeDirectories($deployment, $workdir);
    }

    private function validateSourceBundle(PublishedProjectDeployment $deployment): ?string
    {
        $platform = strtolower(trim((string) data_get($deployment->metadata, 'platform', '')));
        if (! in_array($platform, ['node', 'laravel', 'python'], true)) {
            return 'Runtime bundle has an unsupported platform.';
        }
        if (trim((string) $deployment->start_command) === '') {
            return 'Runtime bundle does not include a start command.';
        }
        if ((bool) data_get($deployment->metadata, 'truncated', false)) {
            return 'Runtime bundle is incomplete because source collection was truncated.';
        }

        $files = is_array($deployment->demo_files) ? $deployment->demo_files : [];
        if ($files === []) {
            return 'Runtime bundle does not contain any deployable files.';
        }
        if (count($files) > self::MAX_RUNTIME_BUNDLE_FILES) {
            return 'Runtime bundle is too large to host: more than '.self::MAX_RUNTIME_BUNDLE_FILES.' files.';
        }
        $expectedFiles = (int) data_get($deployment->metadata, 'totalFiles', 0);
        if ($expectedFiles > 0 && $expectedFiles !== count($files)) {
            return "Runtime bundle is incomplete: expected {$expectedFiles} files but received ".count($files).'.';
        }

        $paths = [];
        $totalBytes = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                return 'Runtime bundle contains an invalid file entry.';
            }
            $rawPath = str_replace('\\', '/', trim((string) ($file['path'] ?? '')));
            $path = $this->safeRelativePath($rawPath);
            if ($path === '' || str_starts_with($rawPath, '/') || preg_match('/^[a-z]:\//i', $rawPath) === 1) {
                return 'Runtime bundle contains an unsafe file path.';
            }
            if (isset($paths[$path])) {
                return "Runtime bundle contains the duplicate file {$path}.";
            }
            $paths[$path] = true;

            $encoding = (string) ($file['encoding'] ?? 'utf8');
            $body = (string) ($file['body'] ?? '');
            if ($encoding === 'base64') {
                $decoded = base64_decode($body, true);
                if ($decoded === false) {
                    return "Runtime bundle file {$path} has invalid base64 content.";
                }
                $bodyBytes = strlen($decoded);
            } elseif ($encoding === 'utf8') {
                $bodyBytes = strlen($body);
            } else {
                return "Runtime bundle file {$path} has an unsupported encoding.";
            }
            if ($bodyBytes === 0) {
                return "Runtime bundle file {$path} is empty.";
            }
            $totalBytes += $bodyBytes;
            if ($totalBytes > self::MAX_RUNTIME_BUNDLE_BYTES) {
                return 'Runtime bundle is too large to host: extracted files exceed 10 MB.';
            }
        }

        $required = match ($platform) {
            'laravel' => ['composer.json', 'artisan', 'public/index.php'],
            'python' => [],
            default => ['package.json'],
        };
        if ($platform === 'python' && ! isset($paths['requirements.txt']) && ! isset($paths['pyproject.toml'])) {
            return 'Runtime bundle is incomplete for Python: missing requirements.txt or pyproject.toml.';
        }
        $missing = array_values(array_filter($required, fn (string $path) => ! isset($paths[$path])));
        if ($missing !== []) {
            return 'Runtime bundle is incomplete for '.Str::headline($platform).': missing '
                .$this->humanList($missing).'.';
        }

        return null;
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
        if ($start === '' && $build === '') {
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
        $sqlite = 'touch /tmp/vibyra-demo.sqlite';
        $commands = [];
        if (! str_contains($start, $prepare)) {
            $commands[] = $prepare;
        }
        if (! str_contains($start, $sqlite)) {
            $commands[] = $sqlite;
        }

        return $commands === [] ? $start : implode(' && ', [...$commands, $start]);
    }

    private function writeDemoRuntimeEnv(PublishedProjectDeployment $deployment, string $workdir): void
    {
        if (($deployment->metadata['platform'] ?? '') !== 'laravel') {
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

    private function runRailway(array $arguments, string $cwd, int $timeoutSeconds, ?string $projectToken = null): array
    {
        if (is_callable($this->runner)) {
            return ($this->runner)($arguments, $cwd, $timeoutSeconds);
        }

        $command = [$this->railwayCliPath(), ...$arguments];
        $process = new Process($command, $cwd, $this->railwayEnv($projectToken), null, $timeoutSeconds);
        $process->run();

        return [
            'ok' => $process->isSuccessful(),
            'output' => trim($process->getOutput()."\n".$process->getErrorOutput()),
        ];
    }

    private function uploadSourceArchive(
        PublishedProjectDeployment $deployment,
        string $workdir,
        string $archivePath,
        string $projectToken,
    ): array {
        $archive = new Process(['tar', '-czf', $archivePath, '-C', $workdir, '.'], $workdir, null, null, 120);
        $archive->run();
        if (! $archive->isSuccessful()) {
            return ['ok' => false, 'output' => trim($archive->getErrorOutput())];
        }

        $environmentId = trim((string) data_get($deployment->metadata, 'providerEnvironmentId', ''));
        $url = 'https://backboard.railway.com/project/'.rawurlencode((string) $deployment->provider_project_id)
            .'/environment/'.rawurlencode($environmentId).'/up'
            .'?serviceId='.rawurlencode((string) $deployment->provider_service_id)
            .'&message='.rawurlencode('Vibyra Explore publish '.$deployment->id);
        $archiveBody = (string) File::get($archivePath);
        $response = Http::withHeaders(['project-access-token' => $projectToken])
            ->withBody($archiveBody, 'application/gzip')
            ->timeout(900)
            ->post($url);

        $authenticationRejected = in_array($response->status(), [401, 403], true)
            || Str::contains(Str::lower($response->body()), [
                'must be logged in',
                'unauthorized',
            ]);
        if ($authenticationRejected) {
            $accountToken = trim((string) config('services.railway.api_token', ''));
            if ($accountToken !== '') {
                $response = Http::withToken($accountToken)
                    ->withBody($archiveBody, 'application/gzip')
                    ->timeout(900)
                    ->post($url);
            }
        }

        return [
            'ok' => $response->successful(),
            'output' => $response->body(),
        ];
    }

    private function waitForRailwayDeployment(string $deploymentId, ?string $projectToken = null): array
    {
        $deadline = time() + max(30, (int) config('services.railway.runtime_ready_timeout', 180));
        do {
            $payload = $this->railwayGraphql(
                'query($id: String!) { deployment(id: $id) { id status } }',
                ['id' => $deploymentId],
                $projectToken,
            );
            if ($payload === null) {
                return [
                    'ok' => false,
                    'output' => $this->lastRailwayError ?: 'Railway deployment status could not be read.',
                ];
            }
            $status = strtoupper((string) data_get($payload, 'deployment.status', ''));
            if ($status === 'SUCCESS') {
                return ['ok' => true, 'output' => json_encode($payload)];
            }
            if (in_array($status, ['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'], true)) {
                return ['ok' => false, 'output' => json_encode($payload)];
            }
            sleep(min(5, max(1, $deadline - time())));
        } while (time() < $deadline);

        return ['ok' => false, 'output' => 'Railway deployment status timed out.'];
    }

    private function railwayServiceUrl(
        string $projectId,
        string $environmentId,
        string $serviceId,
        ?string $projectToken = null,
    ): ?string
    {
        $payload = $this->railwayGraphql(
            'query($projectId: String!, $environmentId: String!, $serviceId: String!) { domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) { serviceDomains { domain } customDomains { domain } } }',
            compact('projectId', 'environmentId', 'serviceId'),
            $projectToken,
        );
        $url = $this->firstRailwayUrl($payload);
        if ($url) {
            return $url;
        }

        $created = $this->railwayGraphql(
            'mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id domain } }',
            ['input' => compact('environmentId', 'serviceId')],
            $projectToken,
        );

        return $this->firstRailwayUrl($created);
    }

    private function withWorkspace(array $arguments): array
    {
        $workspace = trim((string) config('services.railway.team_id', ''));

        return $workspace === '' ? $arguments : [...$arguments, '--workspace', $workspace];
    }

    private function waitForPublicDemoUrl(string $url, PublishedProjectDeployment $deployment): bool
    {
        if (is_callable($this->runner)) {
            return true;
        }

        $expectsFrontend = $this->bundleContainsFrontend($deployment);
        $deadline = time() + max(5, (int) config('services.railway.runtime_ready_timeout', 180));
        do {
            if ($this->publicDemoUrlReady($url, $expectsFrontend)) {
                return true;
            }
            sleep(min(8, max(1, $deadline - time())));
        } while (time() < $deadline);

        return $this->publicDemoUrlReady($url, $expectsFrontend);
    }

    private function publicDemoUrlReady(string $url, bool $expectsFrontend = false): bool
    {
        try {
            $response = Http::timeout(8)->get($url);
        } catch (Throwable) {
            return false;
        }

        if ($response->status() < 200
            || $response->status() >= 400
            || $this->hasInsecureSameHostAssets($response->body(), (string) $response->header('Link'), $url)) {
            return false;
        }

        $isHtml = str_contains(strtolower((string) $response->header('Content-Type')), 'text/html')
            || str_contains(strtolower($response->body()), '<html')
            || str_contains(strtolower($response->body()), '<!doctype html');
        if ($expectsFrontend && ! $isHtml) {
            return false;
        }

        return $this->sameHostFrontendAssetsReady(
            $response->body(),
            (string) $response->header('Link'),
            $url,
        );
    }

    private function bundleContainsFrontend(PublishedProjectDeployment $deployment): bool
    {
        $frontendDirectory = trim((string) data_get($deployment->metadata, 'frontendDistDirectory', ''), '/');
        foreach ((array) $deployment->demo_files as $file) {
            $path = (string) data_get($file, 'path', '');
            if (str_starts_with($path, 'public/build/')
                || ($frontendDirectory !== '' && $path === $frontendDirectory.'/index.html')) {
                return true;
            }
        }

        return false;
    }

    private function sameHostFrontendAssetsReady(string $body, string $linkHeader, string $publicUrl): bool
    {
        if (! str_contains(strtolower($body), '<html')
            && ! str_contains(strtolower($body), '<!doctype html')) {
            return true;
        }

        preg_match_all('/\b(?:src|href)\s*=\s*["\']([^"\']+)["\']/i', $body, $htmlMatches);
        preg_match_all('/<([^>]+)>/', $linkHeader, $linkMatches);
        $references = array_values(array_unique([
            ...($htmlMatches[1] ?? []),
            ...($linkMatches[1] ?? []),
        ]));
        $assets = [];
        foreach ($references as $reference) {
            $assetUrl = $this->sameHostAssetUrl((string) $reference, $publicUrl);
            if ($assetUrl !== null && preg_match('/\.(?:css|m?js)(?:[?#]|$)/i', $assetUrl) === 1) {
                $assets[] = $assetUrl;
            }
        }

        foreach (array_slice(array_values(array_unique($assets)), 0, 20) as $assetUrl) {
            try {
                $asset = Http::timeout(8)->get($assetUrl);
            } catch (Throwable) {
                return false;
            }
            if ($asset->status() < 200 || $asset->status() >= 400) {
                return false;
            }
            if (str_contains(strtolower((string) $asset->header('Content-Type')), 'text/html')) {
                return false;
            }
        }

        return true;
    }

    private function sameHostAssetUrl(string $reference, string $publicUrl): ?string
    {
        $reference = html_entity_decode(trim($reference), ENT_QUOTES | ENT_HTML5);
        if ($reference === '' || str_starts_with($reference, '#') || str_starts_with($reference, 'data:')) {
            return null;
        }

        $scheme = strtolower((string) parse_url($publicUrl, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($publicUrl, PHP_URL_HOST));
        if ($scheme !== 'https' || $host === '') {
            return null;
        }
        if (str_starts_with($reference, '//')) {
            $reference = 'https:'.$reference;
        }
        if (filter_var($reference, FILTER_VALIDATE_URL) !== false) {
            return strtolower((string) parse_url($reference, PHP_URL_HOST)) === $host ? $reference : null;
        }

        $path = str_starts_with($reference, '/')
            ? $reference
            : rtrim((string) parse_url($publicUrl, PHP_URL_PATH), '/').'/'.$reference;

        return 'https://'.$host.'/'.ltrim($path, '/');
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

    private function ensureIsolatedTarget(PublishedProjectDeployment $deployment): ?array
    {
        $projectId = (string) ($deployment->provider_project_id ?? '');
        $serviceId = (string) ($deployment->provider_service_id ?? '');
        $environmentId = (string) data_get($deployment->metadata, 'providerEnvironmentId', '');

        if ($projectId !== '') {
            $project = $this->railwayGraphql(
                'query($id: String!) { project(id: $id) { id environments { edges { node { id name } } } services { edges { node { id name } } } } }',
                ['id' => $projectId]
            );
            $environmentId = $environmentId ?: $this->namedEdgeId(data_get($project, 'project.environments.edges', []), $this->environmentName());
            $serviceId = $serviceId ?: $this->firstEdgeId(data_get($project, 'project.services.edges', []));
        } else {
            $projectInput = [
                'name' => $this->projectName($deployment),
                'description' => 'Isolated Vibyra Explore runtime demo',
                'defaultEnvironmentName' => $this->environmentName(),
            ];
            $workspaceId = trim((string) config('services.railway.team_id', ''));
            if ($workspaceId !== '') {
                $projectInput['workspaceId'] = $workspaceId;
            }
            $project = $this->railwayGraphql(
                'mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id environments { edges { node { id name } } } } }',
                ['input' => $projectInput]
            );
            $projectId = (string) data_get($project, 'projectCreate.id', '');
            $environmentId = $this->namedEdgeId(
                data_get($project, 'projectCreate.environments.edges', []),
                $this->environmentName()
            );
        }

        if ($projectId === '' || $environmentId === '') {
            return null;
        }

        if ($serviceId === '') {
            $service = $this->railwayGraphql(
                'mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }',
                ['input' => [
                    'projectId' => $projectId,
                    'name' => $this->projectName($deployment),
                ]]
            );
            $serviceId = (string) data_get($service, 'serviceCreate.id', '');
        }

        if ($serviceId === '') {
            return null;
        }

        $metadata = is_array($deployment->metadata) ? $deployment->metadata : [];
        $deployment->forceFill([
            'provider_project_id' => $projectId,
            'provider_service_id' => $serviceId,
            'metadata' => [...$metadata, 'providerEnvironmentId' => $environmentId],
        ])->save();

        return compact('projectId', 'serviceId', 'environmentId');
    }

    private function createProjectToken(string $projectId, string $environmentId, string $name): ?string
    {
        $payload = $this->railwayGraphql(
            'mutation($input: ProjectTokenCreateInput!) { projectTokenCreate(input: $input) }',
            ['input' => compact('projectId', 'environmentId', 'name')]
        );
        $token = trim((string) data_get($payload, 'projectTokenCreate', ''));

        return $token !== '' ? $token : null;
    }

    private function deleteProjectToken(string $projectId, string $name): void
    {
        try {
            $payload = $this->railwayGraphql(
                'query($projectId: String!) { projectTokens(projectId: $projectId, first: 100) { edges { node { id name } } } }',
                compact('projectId')
            );
            foreach ((array) data_get($payload, 'projectTokens.edges', []) as $edge) {
                if ((string) data_get($edge, 'node.name', '') !== $name) {
                    continue;
                }
                $id = (string) data_get($edge, 'node.id', '');
                if ($id !== '') {
                    $this->railwayGraphql(
                        'mutation($id: String!) { projectTokenDelete(id: $id) }',
                        compact('id')
                    );
                }
            }
        } catch (Throwable) {
            // Token cleanup must not overwrite the deployment result.
        }
    }

    private function railwayGraphql(string $query, array $variables, ?string $projectToken = null): ?array
    {
        $this->lastRailwayError = '';
        $token = trim((string) ($projectToken ?: config('services.railway.api_token', '')));
        if ($token === '') {
            $this->lastRailwayError = 'The Railway API token is missing.';

            return null;
        }

        $request = $projectToken
            ? Http::withHeaders(['project-access-token' => $token])
            : Http::withToken($token);
        $response = $request
            ->acceptJson()
            ->timeout(30)
            ->post(self::GRAPHQL_URL, compact('query', 'variables'));
        if (! $response->successful()) {
            $this->lastRailwayError = $this->providerOutputDetail($response->body())
                ?: 'Railway API returned HTTP '.$response->status().'.';

            return null;
        }
        $errors = $response->json('errors');
        if (is_array($errors) && $errors !== []) {
            $messages = collect($errors)
                ->map(fn ($error) => trim((string) data_get($error, 'message', '')))
                ->filter()
                ->unique()
                ->take(3)
                ->implode(' ');
            $this->lastRailwayError = Str::limit(
                $messages !== '' ? $messages : 'Railway returned an unknown GraphQL error.',
                500,
                '',
            );

            return null;
        }

        $data = $response->json('data');
        if (! is_array($data)) {
            $this->lastRailwayError = 'Railway returned an invalid API response.';

            return null;
        }

        return $data;
    }

    private function withRailwayError(string $message): string
    {
        return $this->lastRailwayError === ''
            ? $message
            : rtrim($message).' Railway said: '.$this->lastRailwayError;
    }

    private function withProviderOutput(string $message, string $output): string
    {
        $detail = $this->providerOutputDetail($output);

        return $detail === '' ? $message : rtrim($message).' Railway said: '.$detail;
    }

    private function providerOutputDetail(string $output): string
    {
        $decoded = $this->decodeJsonPayload($output);
        if (is_array($decoded)) {
            $messages = [];
            foreach ((array) ($decoded['errors'] ?? []) as $error) {
                $messages[] = trim((string) data_get($error, 'message', ''));
            }
            foreach (['message', 'detail', 'error'] as $key) {
                if (is_string($decoded[$key] ?? null)) {
                    $messages[] = trim($decoded[$key]);
                }
            }
            $status = trim((string) data_get($decoded, 'deployment.status', ''));
            if ($status !== '') {
                $messages[] = 'Deployment status: '.$status.'.';
            }
            $detail = collect($messages)->filter()->unique()->take(3)->implode(' ');
            if ($detail !== '') {
                return Str::limit($detail, 500, '');
            }
        }

        $plain = trim(preg_replace('/\s+/', ' ', strip_tags($output)) ?? '');

        return Str::limit($plain, 500, '');
    }

    private function humanList(array $values): string
    {
        if (count($values) < 2) {
            return (string) ($values[0] ?? '');
        }

        return implode(', ', array_slice($values, 0, -1)).' and '.$values[array_key_last($values)];
    }

    private function namedEdgeId(mixed $edges, string $name): string
    {
        foreach ((array) $edges as $edge) {
            if ((string) data_get($edge, 'node.name', '') === $name) {
                return (string) data_get($edge, 'node.id', '');
            }
        }

        return '';
    }

    private function firstEdgeId(mixed $edges): string
    {
        return (string) data_get((array) $edges, '0.node.id', '');
    }

    private function uploadArguments(PublishedProjectDeployment $deployment): array
    {
        if ($deployment->provider_project_id && $deployment->provider_service_id) {
            return [
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
            ];
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

    private function statusArguments(string $projectId, string $service): array
    {
        return [
            'service',
            'status',
            '--project',
            $projectId,
            '--service',
            $service,
            '--environment',
            $this->environmentName(),
            '--json',
        ];
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

    private function railwayEnv(?string $projectToken = null): array
    {
        if ($projectToken) {
            return [
                'RAILWAY_TOKEN' => $projectToken,
                'RAILWAY_API_TOKEN' => false,
            ];
        }

        $env = ['RAILWAY_TOKEN' => false];
        $token = (string) config('services.railway.api_token', '');
        if ($token !== '') {
            $env['RAILWAY_API_TOKEN'] = $token;
        }

        return $env;
    }

    private function railwayCliPath(): string
    {
        $configured = trim((string) config('services.railway.cli_path', 'railway')) ?: 'railway';
        if ($configured !== 'railway' && is_executable($configured)) {
            return $configured;
        }

        $nixCandidates = glob('/nix/store/*-nodejs-*/lib/node_modules/@railway/cli/bin/railway') ?: [];
        rsort($nixCandidates);
        foreach ($nixCandidates as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        return $configured;
    }

    private function markStopped(PublishedProjectDeployment $deployment, string $message): PublishedProjectDeployment
    {
        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_STOPPED,
            'provider_status' => 'stopped',
            'public_url' => null,
            'last_error' => Str::limit($message, 900, ''),
        ])->save();

        return $deployment;
    }

    public function deleteProject(string $projectId): bool
    {
        $payload = $this->railwayGraphql(
            'mutation($id: String!) { projectDelete(id: $id) }',
            ['id' => $projectId],
        );

        return $payload !== null;
    }

    private function markFailed(PublishedProjectDeployment $deployment, string $message, string $logs): PublishedProjectDeployment
    {
        $logDetail = $this->providerOutputDetail($logs);
        if ($logDetail !== '' && str_contains(Str::lower($message), Str::lower($logDetail))) {
            $logs = '';
        }
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
        return $this->firstString(
            $payload,
            ['deploymentId', 'id'],
            fn ($path) => $path === 'deploymentId'
                || str_contains($path, 'latestDeployment')
                || str_contains($path, 'activeDeployments')
        );
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
