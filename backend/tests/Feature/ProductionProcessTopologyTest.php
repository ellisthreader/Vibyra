<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
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

        // The deployed service is built from the repository root, so the root
        // config is the one Railway actually reads. It used to start `php artisan
        // serve` by itself, which is how production ran with no scheduler and no
        // queue worker at all while this file proved the backend copy was fine.
        $root = json_decode((string) file_get_contents(dirname($backend).'/railway.json'), true, flags: JSON_THROW_ON_ERROR);
        $this->assertStringContainsString('scripts/start-production.sh', $root['deploy']['startCommand']);
    }

    public function test_the_all_in_one_role_runs_the_queue_worker_that_answers_phone_chat(): void
    {
        // `RunVibesTurn` is queued on `vibes`. Without a worker on that queue a
        // deployment accepts a turn, holds the person's Vibes and never answers.
        $commands = $this->launch(['VIBYRA_QUEUE_NAMES' => 'vibes,decisions,notifications,deployments,default']);

        $this->assertContains('php artisan schedule:work', $commands);
        // Agent turns get two workers of their own, so two run at once and a long
        // one never holds up notifications or deployments behind it.
        $this->assertSame(2, count(array_keys($commands, $this->worker('vibes,decisions'), true)));
        $this->assertContains($this->worker('notifications,deployments,default'), $commands);
        $this->assertCount(1, preg_grep('/ -S 0\.0\.0\.0:/', $commands));
    }

    public function test_agent_worker_count_is_configurable_and_zero_restores_the_single_worker(): void
    {
        $three = $this->launch(['VIBYRA_AGENT_WORKERS' => '3']);
        $this->assertSame(3, count(array_keys($three, $this->worker('vibes,decisions'), true)));
        $this->assertContains($this->worker('cloud-workspaces,notifications,deployments,default'), $three);

        $single = $this->launch(['VIBYRA_AGENT_WORKERS' => '0', 'VIBYRA_QUEUE_NAMES' => 'vibes,decisions,default']);
        $this->assertSame([$this->worker('vibes,decisions,default')], array_values(preg_grep('/queue:work/', $single)));
    }

    private function worker(string $queues): string
    {
        return "php artisan queue:work --queue={$queues} --sleep=2 --tries=1 --timeout=1200 --max-time=0";
    }

    /** Runs the launcher's all-in-one role against a stand-in `php` and returns the commands it started. */
    private function launch(array $env): array
    {
        $dir = sys_get_temp_dir().'/vibyra-launch-'.bin2hex(random_bytes(4));
        mkdir($dir.'/bin', 0777, true);
        mkdir($dir.'/cwd/public', 0777, true);
        file_put_contents($dir.'/bin/php', "#!/usr/bin/env bash\necho \"php \$*\" >> \"\$FAKE_PHP_LOG\"\n"
            ."case \"\$*\" in *queue:work*|*schedule:work*|*' -S '*) sleep 1 ;; esac\n");
        chmod($dir.'/bin/php', 0755);
        // Stand in for `wait -n` (bash 4.3+) so the launch also runs on macOS's bash 3.2.
        file_put_contents($dir.'/env.sh', "wait() { if [[ \"\$1\" == -n ]]; then sleep 0.5; return 0; fi; builtin wait \"\$@\"; }\n");

        $process = new Process(['bash', dirname(__DIR__, 2).'/scripts/start-production.sh'], $dir.'/cwd', $env + [
            'PATH' => $dir.'/bin:'.getenv('PATH'), 'BASH_ENV' => $dir.'/env.sh', 'FAKE_PHP_LOG' => $dir.'/log',
            'VIBYRA_PROCESS_ROLE' => 'all', 'VIBYRA_RUN_MIGRATIONS' => '0', 'VIBYRA_QUEUE_NAMES' => false,
            'VIBYRA_AGENT_WORKERS' => false, 'VIBYRA_AGENT_QUEUE_NAMES' => false,
        ]);
        $process->setTimeout(20)->run();
        // Any child stopping ends the service with a failure, so Railway restarts all of it.
        $this->assertSame(1, $process->getExitCode(), $process->getErrorOutput());
        usleep(200_000);
        $commands = array_map(fn ($line) => preg_replace('/(-d \S+ )+/', '', $line),
            file($dir.'/log', FILE_IGNORE_NEW_LINES) ?: []);
        (new Process(['rm', '-rf', $dir]))->run();

        return $commands;
    }

    public function test_example_topology_has_isolated_web_worker_and_scheduler_roles(): void
    {
        $example = (string) file_get_contents(dirname(__DIR__, 2).'/Procfile.production.example');

        foreach (['web', 'worker', 'scheduler'] as $role) {
            $this->assertStringContainsString("VIBYRA_PROCESS_ROLE={$role}", $example);
        }
    }
}
