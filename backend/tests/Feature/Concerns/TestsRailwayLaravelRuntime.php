<?php

namespace Tests\Feature\Concerns;

use App\Models\PublishedProjectDeployment;
use App\Services\Deployments\RailwayRuntimeDeploymentService;

trait TestsRailwayLaravelRuntime
{
    public function test_service_writes_laravel_demo_env_and_build_config(): void
    {
        $deployment = $this->runtimeDeployment([
            'platform' => 'laravel',
            'buildCommand' => 'composer install --no-dev',
            'startCommand' => 'php artisan serve --host=0.0.0.0 --port=${PORT}',
            'files' => [
                [
                    'path' => 'composer.json',
                    'encoding' => 'utf8',
                    'body' => '{"require":{"laravel/framework":"^12.0"}}',
                ],
                [
                    'path' => 'artisan',
                    'encoding' => 'utf8',
                    'body' => "#!/usr/bin/env php\n<?php",
                ],
                [
                    'path' => 'public/index.php',
                    'encoding' => 'utf8',
                    'body' => "<?php\n\nuse Illuminate\\Http\\Request;\n",
                ],
                [
                    'path' => 'railway.json',
                    'encoding' => 'utf8',
                    'body' => '{"deploy":{"startCommand":"echo unsafe"}}',
                ],
                [
                    'path' => '.env',
                    'encoding' => 'utf8',
                    'body' => "APP_DEBUG=true\nAPP_URL=http://localhost\n",
                ],
            ],
        ]);
        $captured = [];
        $service = new RailwayRuntimeDeploymentService(function (array $arguments, string $cwd) use (&$captured) {
            if ($arguments[0] === 'up') {
                $captured['env'] = file_get_contents($cwd.'/.env');
                $captured['index'] = file_get_contents($cwd.'/public/index.php');
                $captured['railway'] = json_decode(file_get_contents($cwd.'/railway.json'), true);
                $captured['cachePlaceholder'] = file_get_contents($cwd.'/bootstrap/cache/.gitignore');

                return ['ok' => true, 'output' => '{"deploymentId":"dep_123"}'];
            }
            if ($arguments[0] === 'list') {
                return ['ok' => true, 'output' => json_encode([[
                    'id' => 'project_123',
                    'name' => 'vibyra-demo-1',
                    'services' => ['edges' => [['node' => ['id' => 'service_123', 'name' => 'Runtime Demo']]]],
                ]])];
            }
            if ($arguments[0] === 'service' && ($arguments[1] ?? '') === 'status') {
                return ['ok' => true, 'output' => '{"deploymentId":"deployment_123"}'];
            }
            if ($arguments[0] === 'domain') {
                return ['ok' => true, 'output' => '{"domain":"laravel-demo.up.railway.app"}'];
            }

            return ['ok' => false, 'output' => 'unexpected'];
        });

        $result = $service->deploy($deployment);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $result->status);
        $this->assertStringContainsString('APP_KEY=base64:', $captured['env'] ?? '');
        $this->assertStringContainsString('APP_DEBUG=false', $captured['env'] ?? '');
        $this->assertStringContainsString('DB_CONNECTION=sqlite', $captured['env'] ?? '');
        $this->assertStringNotContainsString('APP_DEBUG=true', $captured['env'] ?? '');
        $this->assertStringNotContainsString('APP_URL=', $captured['env'] ?? '');
        $this->assertStringNotContainsString('ASSET_URL=', $captured['env'] ?? '');
        $this->assertStringContainsString('HTTP_X_FORWARDED_PROTO', $captured['index'] ?? '');
        $this->assertStringContainsString("\$_SERVER['HTTPS'] = 'on';", $captured['index'] ?? '');
        $this->assertStringContainsString('use Illuminate\\Http\\Request;', $captured['index'] ?? '');
        $this->assertSame("*\n!.gitignore\n", $captured['cachePlaceholder'] ?? null);
        $this->assertSame('composer install --no-dev', $captured['railway']['build']['buildCommand'] ?? null);
        $this->assertSame(
            'mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && touch /tmp/vibyra-demo.sqlite && php artisan serve --host=0.0.0.0 --port=${PORT}',
            $captured['railway']['deploy']['startCommand'] ?? null
        );
    }
}
