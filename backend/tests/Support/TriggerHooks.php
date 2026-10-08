<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/** Signed Linear / Slack / GitHub deliveries and their triggers for the Part 4 trigger tests. */
trait TriggerHooks
{
    protected const LINEAR_SECRET = 'lin_wh_testSecret1234567890abcdefgh';
    protected const SLACK_SECRET = 'slack-signing-secret-for-tests';
    protected const ME = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

    /** @return array the trigger (plus 'secret' when the response carried one) */
    protected function makeTrigger(string $kind, array $filter, array $extra = []): array
    {
        $r = $this->postJson('/api/agents/v2/triggers', [...['agentId' => $this->agent['id'], 'kind' => $kind, 'filter' => $filter,
            'promptTemplate' => 'Handle this.'], ...$extra])->assertCreated();
        return [...$r->json('trigger'), 'secret' => $r->json('webhook.secret')];
    }

    protected function linearTrigger(array $filter = [], array $extra = []): array
    {
        return $this->makeTrigger('linear.issue', $filter, ['signingSecret' => self::LINEAR_SECRET, ...$extra]);
    }

    protected function linearIssue(array $data = [], string $action = 'create', array $over = []): array
    {
        return [...['action' => $action, 'type' => 'Issue', 'createdAt' => gmdate('c'), 'webhookTimestamp' => (int) now()->getPreciseTimestamp(3),
            'actor' => ['id' => 'ffffffff-0000-4000-8000-000000000001', 'type' => 'user', 'name' => 'Pat'],
            'data' => [...['id' => 'issue-uuid-1', 'identifier' => 'ENG-12', 'title' => 'Checkout fails', 'description' => 'Pay button does nothing.',
                'teamId' => 'team-uuid-1', 'team' => ['id' => 'team-uuid-1', 'key' => 'ENG', 'name' => 'Engineering'], 'labels' => [['name' => 'bug']],
                'state' => ['name' => 'Todo'], 'url' => 'https://linear.app/acme/issue/ENG-12'], ...$data]], ...$over];
    }

    protected function linear(array $trigger, array $payload, ?string $secret = null, ?string $signature = null)
    {
        $raw = json_encode($payload);
        return $this->call('POST', '/api/agents/v2/hooks/linear/'.$trigger['id'], [], [], [], ['CONTENT_TYPE' => 'application/json',
            'HTTP_LINEAR_SIGNATURE' => $signature ?? hash_hmac('sha256', $raw, $secret ?? self::LINEAR_SECRET), 'HTTP_LINEAR_DELIVERY' => 'delivery-'.uniqid()], $raw);
    }

    protected function githubIssue(string $action = 'opened', int $number = 7, string $sender = 'octocat'): array
    {
        return ['action' => $action, 'repository' => ['full_name' => 'acme/app'], 'sender' => ['login' => $sender],
            'issue' => ['number' => $number, 'title' => 'Login broken', 'body' => 'Blank page.', 'user' => ['login' => $sender], 'labels' => [],
                'html_url' => 'https://github.com/acme/app/issues/'.$number]];
    }

    protected function github(array $trigger, array $payload, string $delivery)
    {
        $raw = json_encode($payload);
        return $this->call('POST', '/api/agents/v2/hooks/github/'.$trigger['id'], [], [], [], ['CONTENT_TYPE' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $raw, $trigger['secret']), 'HTTP_X_GITHUB_EVENT' => 'issues',
            'HTTP_X_GITHUB_DELIVERY' => $delivery], $raw);
    }

    /** A Slack connection for a workspace with the bot scope Slack needs (or without, to prove the reconnect state). */
    protected function slackConnection(bool $mentions = true, string $label = 'Acme · T0123ABCD/U0HUMAN001'): string
    {
        $id = $this->providerInstall('slack', $label, 'xoxp-token');
        DB::table('agent_connections')->where('id', $id)->update(['scopes' => json_encode($mentions ? ['search:read', 'chat:write', 'app_mentions:read'] : ['search:read'])]);
        $this->grant($id, ['slack_read_channel']);
        return $id;
    }

    protected function mention(array $event = [], array $over = []): array
    {
        return [...['type' => 'event_callback', 'event_id' => 'Ev'.strtoupper(bin2hex(random_bytes(5))), 'team_id' => 'T0123ABCD',
            'authorizations' => [['user_id' => 'U0BOT000001', 'is_bot' => true]],
            'event' => [...['type' => 'app_mention', 'user' => 'U0HUMAN002', 'text' => '<@U0BOT000001> please look at the deploy', 'channel' => 'C0123456789',
                'ts' => '1700000000.000100'], ...$event]], ...$over];
    }

    protected function slack(array|string $body, ?int $timestamp = null, ?string $secret = null, array $headers = [])
    {
        $raw = is_string($body) ? $body : json_encode($body);
        $ts = (string) ($timestamp ?? time());
        return $this->call('POST', '/api/agents/v2/hooks/slack', [], [], [], ['CONTENT_TYPE' => 'application/json',
            'HTTP_X_SLACK_REQUEST_TIMESTAMP' => $ts,
            'HTTP_X_SLACK_SIGNATURE' => 'v0='.hash_hmac('sha256', 'v0:'.$ts.':'.$raw, $secret ?? self::SLACK_SECRET), ...$headers], $raw);
    }

    /** What the queue worker does with an enqueued mention. */
    protected function runSlackJobs(): void
    {
        \Illuminate\Support\Facades\Queue::pushed(\App\Jobs\ProcessSlackEvent::class)
            ->each(fn ($job) => app()->call([$job, 'handle']));
    }
}
