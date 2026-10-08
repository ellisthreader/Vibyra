<?php

namespace Tests\Support;

use App\Models\{User, VibyraSession};
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\AgentRuns\Tools\ToolCatalog;
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Illuminate\Support\Str;

/** Shared setup for Agent V2 feature tests: account, teammate, Gmail, runtime, run. */
trait AgentV2Fixture
{
    protected User $user;
    protected array $agent;
    protected array $runtime;
    protected string $hostId;
    protected array $gmailInboxes = [];
    private bool $gmailFaked = false;

    protected function bootV2(): void
    {
        config(['app.key' => 'base64:'.base64_encode(str_repeat('k', 32)), 'agents.enabled' => true,
            'chat_connectors.enabled' => true, 'agents_v2.enabled' => true]);
        Http::preventStrayRequests();
        $this->user = User::factory()->create();
        config(['agents_v2.user_ids' => (string) $this->user->id]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'v2-session'), 'device_name' => 'Mac']);
        $this->withToken('v2-session');
        // Existing accounts have a wallet row; v1 teammate creation locks it. V2 never touches it.
        app(\App\Services\Vibes\Wallet::class)->ensure($this->user);
        $this->agent = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Inbox',
            'brief' => 'Summarize mail.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $this->hostId = str_repeat('b', 64);
        $this->runtime = $this->registerRuntime('acct-1');
    }

    protected function registerRuntime(string $accountRef, bool $controlled = true): array
    {
        return $this->postJson('/api/agents/v2/runtimes', ['hostId' => $this->hostId, 'provider' => 'codex',
            'accountRef' => $accountRef, 'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3',
            'capabilities' => ['controlledTools' => $controlled, 'pinnedSkillsV1' => true]])->assertCreated()->json('runtime');
    }

    /** A legacy install row, exactly as the existing connect/OAuth flow stores it. */
    protected function gmailInstall(string $email, string $token = 'gmail-token-a'): string
    {
        DB::table('vibes_integration_installs')->updateOrInsert(['user_id' => $this->user->id, 'integration' => 'gmail'], [
            'credential' => Crypt::encryptString($token), 'account_label' => $email, 'connected_at' => now(),
            'created_at' => now(), 'updated_at' => now()]);
        LegacyInstalls::sync($this->user->id);
        return DB::table('agent_connections')->where('user_id', $this->user->id)->where('provider', 'gmail')
            ->where('external_identity', $email)->whereNull('revoked_at')->value('id');
    }

    protected function grant(string $connectionId, array $ops = ['gmail_read', 'gmail_search']): array
    {
        return $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$connectionId, ['operations' => $ops])
            ->assertOk()->json('grant');
    }

    protected function admit(string $prompt = 'Summarize my test emails.', ?string $key = null): array
    {
        return $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'],
            'idempotencyKey' => $key ?? 'send-'.Str::random(12), 'prompt' => $prompt])->assertCreated()->json('run');
    }

    /** What the approval card quotes. The runner is never given it, so a test reads it where the person's client would. */
    protected function fingerprintOf(array $action): string
    {
        return (string) DB::table('agent_tool_actions')->where('id', $action['id'])->value('fingerprint');
    }

    protected function runnerPath(string $suffix = ''): string
    {
        return '/api/agents/v2/runner/'.$this->runtime['id'].$suffix;
    }

    protected function runnerHeaders(): array
    {
        return ['X-Vibyra-Runner-Key' => $this->runtime['runnerKey']];
    }

    protected function claim(): array
    {
        return $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertOk()->json('run');
    }

    protected function callTool(array $claimed, string $tool, string $connectionId, array $args, string $callId)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/tools'), ['generation' => $claimed['generation'],
            'callId' => $callId, 'tool' => $tool, 'connectionId' => $connectionId,
            'schemaRevision' => app(ToolCatalog::class)->schemaRevision($tool), 'arguments' => $args], $this->runnerHeaders());
    }

    /** Gmail answers per access token, so a test can prove which account was used. */
    protected function fakeGmail(array $byToken): void
    {
        $this->gmailInboxes = $byToken;
        if ($this->gmailFaked) return;
        $this->gmailFaked = true;
        Http::fake(['gmail.googleapis.com/*' => function ($request) {
            $token = substr((string) $request->header('Authorization')[0], 7);
            $inbox = $this->gmailInboxes[$token] ?? null;
            if ($inbox === null) return Http::response(['error' => 'unauthorized'], 401);
            $path = parse_url($request->url(), PHP_URL_PATH);
            if (str_ends_with($path, '/messages/send')) return Http::response(['id' => 'sent-1', 'threadId' => 't-sent']);
            if (str_ends_with($path, '/messages')) return Http::response(['messages' => array_map(
                fn ($id) => ['id' => $id, 'threadId' => 't-'.$id], array_keys($inbox))]);
            $id = basename($path);
            $msg = $inbox[$id] ?? null;
            if (!$msg) return Http::response(['error' => 'not found'], 404);
            return Http::response(['id' => $id, 'snippet' => mb_substr($msg['body'], 0, 50), 'payload' => [
                'mimeType' => 'text/plain', 'headers' => [['name' => 'From', 'value' => $msg['from']],
                    ['name' => 'Subject', 'value' => $msg['subject']], ['name' => 'Date', 'value' => 'Tue, 29 Sep 2026']],
                'body' => ['data' => rtrim(strtr(base64_encode($msg['body']), '+/', '-_'), '=')]]]);
        }]);
    }
}
