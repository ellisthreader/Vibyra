<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\File;

trait HandlesRailwayLaravelRuntime
{
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
}
