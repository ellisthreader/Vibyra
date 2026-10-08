<?php
use App\Models\{User, VibyraSession};
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/** One account with a teammate, a registered Mac runtime and (optionally) a granted Gmail connection. */
final class ConcFixture
{
    /** @return array{user: int, token: string, agent: string, hostId: string, runtime: array, gmail: ?string} */
    public static function make(bool $gmail = true, array $ops = ['gmail_read', 'gmail_search', 'gmail_send'], ?array $existing = null): array
    {
        $user = $existing ? User::query()->findOrFail($existing['user']) : User::factory()->create();
        $token = $existing['token'] ?? 'conc-'.$user->id.'-'.bin2hex(random_bytes(6));
        if (!$existing) VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Mac']);
        app(\App\Services\Vibes\Wallet::class)->ensure($user);
        $agent = app(Teammates::class)->save($user->id, ['id' => (string) Str::uuid(), 'name' => 'Inbox '.Str::random(4),
            'brief' => 'Summarize mail.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $hostId = $existing['hostId'] ?? bin2hex(random_bytes(32));
        $runtime = $existing['runtime'] ?? self::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $token, ['hostId' => $hostId,
            'provider' => 'codex', 'accountRef' => 'acct-1', 'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3',
            'capabilities' => ['controlledTools' => true, 'pinnedSkillsV1' => true]]), 201)['runtime'];
        $fx = ['user' => $user->id, 'token' => $token, 'agent' => $agent['id'], 'hostId' => $hostId, 'runtime' => $runtime, 'gmail' => $existing['gmail'] ?? null];
        if ($gmail) {
            $fx['gmail'] ??= self::gmailInstall($user->id);
            self::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$agent['id'].'/grants/'.$fx['gmail'], $token, ['operations' => $ops]), 200);
        }
        return $fx;
    }

    public static function gmailInstall(int $userId): string
    {
        DB::table('vibes_integration_installs')->updateOrInsert(['user_id' => $userId, 'integration' => 'gmail'], [
            'credential' => Crypt::encryptString('tok-'.$userId), 'account_label' => 'owner-'.$userId.'@example.com',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        LegacyInstalls::sync($userId);
        return (string) DB::table('agent_connections')->where('user_id', $userId)->where('provider', 'gmail')->whereNull('revoked_at')->value('id');
    }

    /** A GitHub install granted to the fixture's teammate for issue writes; returns its connection id. */
    public static function github(array $fx, array $ops = ['github_create_issue']): string
    {
        DB::table('vibes_integration_installs')->updateOrInsert(['user_id' => $fx['user'], 'integration' => 'github'], [
            'credential' => Crypt::encryptString('tok-gh-'.$fx['user']), 'account_label' => '@octo-'.$fx['user'], 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        LegacyInstalls::sync($fx['user']);
        $id = (string) DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'github')->whereNull('revoked_at')->value('id');
        self::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$id, $fx['token'], ['operations' => $ops]), 200);
        return $id;
    }

    /** Another teammate for the same account (its own serial conversation). */
    public static function teammate(array $fx, ?array $ops = ['gmail_read', 'gmail_search']): string
    {
        $agent = app(Teammates::class)->save($fx['user'], ['id' => (string) Str::uuid(), 'name' => 'Mate '.Str::random(4),
            'brief' => 'Help.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        if ($ops && $fx['gmail']) self::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$agent['id'].'/grants/'.$fx['gmail'], $fx['token'], ['operations' => $ops]), 200);
        return $agent['id'];
    }

    public static function admit(array $fx, string $prompt, ?string $key = null, ?string $agent = null): array
    {
        return self::ok(ConcHttp::call('POST', '/api/agents/v2/runs', $fx['token'], ['agentId' => $agent ?? $fx['agent'],
            'idempotencyKey' => $key ?? 'conc-'.Str::random(14), 'prompt' => $prompt]), 201)['run'];
    }

    /** Claim the oldest queued run as the Mac runner would. */
    public static function claim(array $fx): array
    {
        return self::ok(ConcHttp::runner($fx, 'POST', '/claim'), 200)['run'];
    }

    /** Runner tool call; a write comes back pending_approval with its fingerprint. */
    public static function toolCall(array $fx, array $claimed, string $tool, array $args, string $callId): array
    {
        $rev = app(\App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision($tool);
        return ConcHttp::runner($fx, 'POST', '/runs/'.$claimed['id'].'/tools', ['generation' => $claimed['generation'], 'callId' => $callId,
            'tool' => $tool, 'connectionId' => $fx['gmail'], 'schemaRevision' => $rev, 'arguments' => $args]);
    }

    /** A Mac folder grant exactly as the Mac's picker stores it, and a runtime that declares computer tools. Not synced yet. */
    public static function workspace(array $fx): array
    {
        $fx['runtime'] = self::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $fx['token'], ['hostId' => $fx['hostId'], 'provider' => 'codex',
            'accountRef' => 'acct-1', 'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3',
            'capabilities' => ['controlledTools' => true, 'computerTools' => true]]), 201)['runtime'];
        DB::table('remote_hosts')->where('host_id', $fx['hostId'])->update(['platform' => 'macos']);
        $fx['workspace'] = (string) Str::uuid();
        DB::table('agent_workspaces')->insert(['id' => $fx['workspace'], 'user_id' => $fx['user'], 'agent_id' => $fx['agent'], 'host_id' => $fx['hostId'],
            'label' => 'Vibyra repo', 'can_write' => true, 'can_test' => true, 'runner_key_hash' => hash('sha256', Str::random(64)),
            'created_at' => now(), 'updated_at' => now()]);
        return $fx;
    }

    /** A gmail_send waiting for approval. The runner never sees the fingerprint, so it comes from the person's view of the run. */
    public static function write(array $fx, array $claimed, array $args, string $callId): array
    {
        $r = self::toolCall($fx, $claimed, 'gmail_send', $args, $callId);
        if ($r['status'] !== 200 || ($r['json']['action']['state'] ?? null) !== 'pending_approval') throw new RuntimeException('no pending write: '.json_encode($r));
        $run = self::ok(ConcHttp::call('GET', '/api/agents/v2/runs/'.$claimed['id'], $fx['token']), 200)['run'];
        $view = collect($run['actions'])->firstWhere('id', $r['json']['action']['id']);
        return [...$r['json']['action'], 'runId' => $claimed['id'], 'fingerprint' => $view['fingerprint']];
    }

    public static function ok(array $r, int $status): array
    {
        if ($r['status'] !== $status) throw new RuntimeException('Fixture call expected '.$status.', got '.$r['status'].' '.json_encode($r['json']));
        return $r['json'];
    }
}
