<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProductionProcessTopologyTest extends TestCase
{
    public function test_active_platform_configs_use_the_role_aware_launcher(): void
    {
        $backend = dirname(__DIR__, 2);
        $railway = json_decode((string) file_get_contents($backend.'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        $nixpacks = (string) file_get_contents($backend.'/nixpacks.toml');
        $procfile = (string) file_get_contents($backend.'/Procfile');

        $this->assertSame('bash scripts/start-production.sh', $railway['deploy']['startCommand']);
        $this->assertStringContainsString('cmd = "bash scripts/start-production.sh"', $nixpacks);
        $this->assertStringContainsString('VIBYRA_PROCESS_ROLE=all bash scripts/start-production.sh', $procfile);
        $launcher = (string) file_get_contents($backend.'/scripts/start-production.sh');
        $this->assertStringContainsString('bash scripts/start-production-web.sh', $launcher);
        $web = (string) file_get_contents($backend.'/scripts/start-production-web.sh');
        $this->assertStringContainsString('upload_max_filesize=8M', $web);
        $this->assertStringContainsString('post_max_size=48M', $web);
        $config = (string) file_get_contents($backend.'/scripts/production-config.php');
        $this->assertStringContainsString('php_admin_value[upload_max_filesize] = 8M', $config);
        $this->assertStringContainsString('php_admin_value[post_max_size] = 48M', $config);
        $this->assertStringContainsString('fastcgi_buffering off', $config);
        $this->assertStringContainsString('"nginx"', $nixpacks);

        // The root config has to use the same launcher. The live service reads
        // `backend/railway.json`, but a service pointed at the repository root
        // reads this one, and it used to start `php artisan serve` by itself -
        // no scheduler and no queue worker at all.
        $root = json_decode((string) file_get_contents(dirname($backend).'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertStringContainsString('scripts/start-production.sh', $root['deploy']['startCommand']);
    }

    public function test_the_all_in_one_role_runs_the_queue_worker_that_answers_phone_chat(): void
    {
        $launcher = (string) file_get_contents(dirname(__DIR__, 2).'/scripts/start-production.sh');

        // `RunVibesTurn` is queued on `vibes`. Without a worker on that queue a
        // deployment accepts a turn, holds the person's Vibes and never answers.
        $this->assertStringContainsString('vibes,deployments,default', $launcher);
        $this->assertStringContainsString('start_worker &', $launcher);
        $this->assertStringContainsString('php artisan schedule:work &', $launcher);
        // A worker ends itself after `--max-time`, and in this role any child
        // exiting ends the container, which Railway does not restart on status 0.
        // So the worker is restarted in a loop instead of being allowed to exit.
        $this->assertMatchesRegularExpression('/start_worker\(\) \{\s*while true; do/', $launcher);
    }

    public function test_example_topology_has_isolated_web_worker_and_scheduler_roles(): void
    {
        $example = (string) file_get_contents(dirname(__DIR__, 2).'/Procfile.production.example');

        foreach (['web', 'worker', 'scheduler'] as $role) {
            $this->assertStringContainsString("VIBYRA_PROCESS_ROLE={$role}", $example);
        }
    }
}
