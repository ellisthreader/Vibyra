<?php

namespace Tests\Support;

use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** A Mac folder grant (as the Mac's picker creates it) plus the leased runner's computer endpoints. */
trait AgentV2ComputerFixture
{
    protected string $workspaceId;

    protected function bootComputer(bool $flags = true, bool $capable = true): void
    {
        $this->computerFlags($flags);
        config(['vibes.queue_connection' => 'sync']);
        $this->runtime = $this->postJson('/api/agents/v2/runtimes', ['hostId' => $this->hostId, 'provider' => 'codex',
            'accountRef' => 'acct-1', 'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3',
            'capabilities' => ['controlledTools' => true, 'computerTools' => $capable]])->assertCreated()->json('runtime');
        DB::table('remote_hosts')->where('host_id', $this->hostId)->update(['platform' => 'macos']);
        $this->workspaceId = (string) Str::uuid();
        DB::table('agent_workspaces')->insert(['id' => $this->workspaceId, 'user_id' => $this->user->id,
            'agent_id' => $this->agent['id'], 'host_id' => $this->hostId, 'label' => 'Vibyra repo', 'can_write' => true,
            'can_test' => true, 'runner_key_hash' => hash('sha256', Str::random(64)), 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function computerFlags(bool $on): void
    {
        config(['agents.local_runner_enabled' => $on, 'agents.vm_tests_enabled' => $on,
            'agents.git_publish_enabled' => $on, 'agents.github_pr_enabled' => $on]);
    }

    protected function computerConnection(): ?string
    {
        LegacyInstalls::sync($this->user->id);
        return DB::table('agent_connections')->where('workspace_id', $this->workspaceId)->whereNull('revoked_at')->value('id');
    }

    protected function macList(array $claimed, ?int $generation = null)
    {
        return $this->getJson($this->runnerPath('/runs/'.$claimed['id'].'/computer?generation='.($generation ?? $claimed['generation'])),
            $this->runnerHeaders());
    }

    protected function macClaim(array $claimed, array $action, ?int $generation = null)
    {
        $fingerprint = $action['fingerprint'] ?? DB::table('agent_tool_actions')->where('id', $action['id'])->value('fingerprint');
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/computer/'.$action['id'].'/claim'),
            ['generation' => $generation ?? $claimed['generation'], 'fingerprint' => $fingerprint], $this->runnerHeaders());
    }

    protected function macReceipt(array $claimed, string $actionId, array $result, ?int $generation = null)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/computer/'.$actionId.'/receipt'),
            ['generation' => $generation ?? $claimed['generation'], 'result' => $result], $this->runnerHeaders());
    }

    /** Claim then answer one Mac action, as the Rust runner does. */
    protected function macRun(array $claimed, array $action, array $result)
    {
        $this->macClaim($claimed, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        return $this->macReceipt($claimed, $action['id'], $result);
    }

    protected function toolNames(string $runId): array
    {
        return array_column($this->getJson('/api/agents/v2/runs/'.$runId.'/tools')->assertOk()->json('manifest.tools'), 'tool');
    }
}
