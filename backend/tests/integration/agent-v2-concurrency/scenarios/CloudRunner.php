<?php

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Admission, Cloud\Policies, Cloud\Registration};
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/** Actual loopback Laravel HTTP + separate headless processes + synthetic Claude + actual MCP broker. */
final class ConcCloudRunner
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 3 headless Laravel integration';
        ConcCloudAgentOps::configure();
        $token = 'sk-ant-oat01-'.str_repeat('x', 25);
        $account = 'cloud-'.substr(hash('sha256', $token), 0, 32);
        [$fx, $w, $session] = ConcCloudAgents::fixture($account);
        $policy = app(Policies::class)->save($session, ConcCloudAgents::body($session, $account))['policy'];
        $registered = app(Registration::class)->register($w, ['generation' => $w->generation, 'runtimeId' => $policy['runtimeId'],
            'provider' => 'claude', 'accountId' => $account, 'model' => 'sonnet', 'effort' => 'high',
            'capabilities' => ['pinnedSkillsV1' => true]]);
        $root = dirname(__DIR__, 5);
        $crate = realpath(getenv('CONC_CLOUD_CRATE') ?: $root.'/cloud-runtime/agent-runner');
        if (!$crate) throw new RuntimeException('Cloud fixture crate not found.');
        $example = $crate.'/target/debug/examples/fixture';
        $broker = $crate.'/target/debug/vibyra-cloud-agent';
        if (!is_executable($example) || !is_executable($broker)) throw new RuntimeException('Build the cloud fixture example and runner first.');
        $work = sys_get_temp_dir().'/agent-cloud-http-'.bin2hex(random_bytes(8)); mkdir($work, 0700);
        mkdir($work.'/home', 0700);
        copy($crate.'/tests/fake-cloud-files.py', $work.'/claude'); chmod($work.'/claude', 0700);
        $listener = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
        if (!$listener) throw new RuntimeException('Could not reserve a loopback port.');
        $address = stream_socket_get_name($listener, false); fclose($listener);
        $server = new Process([PHP_BINARY, '-S', $address, __DIR__.'/../cloud-runner-server.php'], dirname(__DIR__, 4).'/public',
            ['PHP_CLI_SERVER_WORKERS' => '1']);
        $server->setTimeout(null); $server->start();
        try {
            $ready = false;
            for ($i = 0; $i < 80; $i++) {
                $sock = @stream_socket_client('tcp://'.$address, $errno, $error, 0.1);
                if ($sock) { fclose($sock); $ready = true; break; } usleep(100000);
            }
            if (!$ready) throw new RuntimeException('Owned HTTP server did not start.');
            $ids = [];
            $prompts = ['STAGE3 SAVE', 'STAGE3 RESTORE'];
            if (config('agents_v2.work_enabled')) $prompts[] = 'STAGE4 PINNED SKILLS';
            foreach ($prompts as $prompt) {
                if ($prompt === 'STAGE4 PINNED SKILLS') $skill = app(\App\Services\Agents\Skills::class)->save($fx['user'],
                    ['id' => (string) \Illuminate\Support\Str::uuid(), 'revision' => 0, 'name' => 'Stage Four evidence',
                        'instructions' => 'STAGE4 ORIGINAL PINNED INSTRUCTION', 'teammateIds' => [$fx['agent']]]);
                DB::table('cloud_workspaces')->where('id', $w->id)->update(['lease_until' => now()->addMinutes(3)]);
                [$run] = app(Admission::class)->admit($fx['user'], ['agentId' => $fx['agent'], 'runtimeId' => $policy['runtimeId'],
                    'idempotencyKey' => strtolower(str_replace(' ', '-', $prompt)), 'prompt' => $prompt]);
                $ids[] = $run->id;
                if ($prompt === 'STAGE4 PINNED SKILLS') app(\App\Services\Agents\Skills::class)->save($fx['user'],
                    ['id' => $skill['id'], 'revision' => 1, 'name' => 'Stage Four evidence',
                        'instructions' => 'STAGE4 NEW UNREVIEWED INSTRUCTION', 'teammateIds' => [$fx['agent']]]);
                $process = new Process([$example]); $process->setTimeout(90);
                $process->setInput(json_encode(['origin' => 'http://'.$address, 'runtimeId' => $registered['runtimeId'], 'runnerKey' => $registered['runnerKey'],
                    'program' => $work.'/claude', 'home' => $work.'/home', 'base' => $work.'/runs', 'broker' => $broker]));
                $process->mustRun();
                $fresh = $run->fresh();
                Conc::check($prompt.' completes through a real separate headless provider/broker process',
                    $fresh->state === 'completed' && $fresh->lease_generation === 1, 'state='.$fresh->state);
                if ($fresh->state !== 'completed') throw new RuntimeException('Headless fixture did not complete: '.json_encode($fresh->only(['state', 'failure_code', 'failure_message'])));
            }
            Conc::check('lost write reply replay creates one immutable file version', DB::table('agent_cloud_file_versions')->count() === 1
                && DB::table('agent_tool_actions')->where('run_id', $ids[0])->where('tool', 'cloud_write_file')->count() === 1);
            Conc::check('replacement worker reads same private file and same original source run',
                DB::table('agent_tool_actions')->where('run_id', $ids[1])->where('tool', 'cloud_read_file')->where('state', 'completed')->count() === 1
                && DB::table('agent_cloud_file_versions')->value('run_id') === $ids[0]);
            Conc::check('actual cloud task snapshots pin selected credential identity and computer',
                Run::whereIn('id', $ids)->get()->every(fn ($r) => $r->runtime_snapshot['accountRef'] === $account
                    && $r->runtime_snapshot['executionTarget'] === 'cloud' && $r->runtime_snapshot['cloudWorkspaceId'] === $w->id));
            Conc::check('ephemeral broker files are removed after both separate workers', count(glob($work.'/runs/*') ?: []) === 0);
        } finally {
            $server->stop(2); // Own Process only; no fixed-port or name-based pkill.
            (new Illuminate\Filesystem\Filesystem)->deleteDirectory($work);
        }
    }
}
