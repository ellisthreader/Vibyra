<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentDepthFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: the secret guard in the broker: masked cards and journal, explicit confirmation, masked results and history (fixtures). */
class AgentDepthSecretGuardTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture;

    private const TOKEN = 'ghp_k3Jq8ZxV2mNw7RbT4YcD1sHjL6GpUa0EoI5t';
    private const REPO = '#api\.github\.com/repos/qa-org/sandbox/issues$#';
    private string $github;
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->github = $this->providerInstall('github', '@owner', 'gh-token');
        $this->grant($this->github, ['github_create_issue']);
        $this->route('POST', self::REPO, Http::response(['number' => 12, 'title' => 'Deploy', 'html_url' => 'https://github.com/qa-org/sandbox/issues/12'], 201));
    }

    private function pendingIssue(string $body = 'Deploy key: '.self::TOKEN): array
    {
        $run = $this->admit('Open an issue.');
        $this->claimed = $this->claim();
        $action = $this->callTool($this->claimed, 'github_create_issue', $this->github, ['repository' => 'qa-org/sandbox', 'title' => 'Deploy', 'body' => $body], 'w1')
            ->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        return [$run, $action];
    }

    public function test_a_card_with_a_secret_is_masked_everywhere_and_needs_an_explicit_confirmation(): void
    {
        $this->depth(['secret_guard']);
        [$run, $action] = $this->pendingIssue();
        $card = $this->getJson('/api/agents/v2/runs/'.$run['id'])->assertOk()->json('run.actions.0');
        $this->assertTrue($card['containsSecret']);
        $this->assertSame(['github_token'], $card['secretKinds']);
        $this->assertSame('Deploy key: [redacted:github_token]', $card['arguments']['body']);
        $journal = json_encode($this->getJson('/api/agents/v2/runs/'.$run['id'].'/events')->json());
        $this->assertStringNotContainsString(self::TOKEN, $journal);
        $this->assertStringContainsString('containsSecret', $journal);
        $decide = fn (array $extra = []) => $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision',
            ['fingerprint' => $this->fingerprintOf($action), 'decision' => 'allow', ...$extra]);
        $decide()->assertStatus(422)->assertJsonPath('code', 'secret_confirmation_required');
        $decide(['confirmSecret' => false])->assertStatus(422);
        $this->assertSame('pending_approval', DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'));
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/issues'));
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => $this->fingerprintOf($action), 'decision' => 'decline'])
            ->assertOk()->assertJsonPath('action.state', 'declined'); // declining needs no confirmation
    }

    public function test_a_confirmed_card_sends_exactly_what_the_teammate_wrote_and_is_logged(): void
    {
        $this->depth(['secret_guard']);
        [, $action] = $this->pendingIssue();
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => $this->fingerprintOf($action), 'decision' => 'allow',
            'confirmSecret' => true])->assertOk()->assertJsonPath('action.state', 'completed');
        Http::assertSent(fn ($r) => str_contains($r->url(), '/issues') && str_contains((string) $r->body(), self::TOKEN));
        $row = DB::table('account_audit_events')->where('event', 'secret_guard.confirmed')->sole();
        $this->assertStringNotContainsString(self::TOKEN, (string) $row->detail);
        $this->assertSame('github_token', json_decode($row->detail, true)['kinds']);
    }

    public function test_a_card_without_a_secret_is_unchanged(): void
    {
        $this->depth(['secret_guard']);
        [$run, $action] = $this->pendingIssue('Plain text body.');
        $card = $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.actions.0');
        $this->assertSame([false, [], 'Plain text body.'], [$card['containsSecret'], $card['secretKinds'], $card['arguments']['body']]);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed');
    }

    public function test_with_the_guard_off_nothing_is_masked_and_no_confirmation_is_asked(): void
    {
        [$run, $action] = $this->pendingIssue();
        $card = $this->getJson('/api/agents/v2/runs/'.$run['id'])->json('run.actions.0');
        $this->assertSame(['Deploy key: '.self::TOKEN, false], [$card['arguments']['body'], $card['containsSecret']]);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed');
    }

    public function test_a_tool_result_is_masked_before_the_model_reads_it_only_while_the_guard_is_on(): void
    {
        $gmail = $this->gmailInstall('owner@example.com');
        $this->grant($gmail, ['gmail_read', 'gmail_search']);
        $this->fakeGmail(['gmail-token-a' => ['msg00001' => ['from' => 'ops@example.com', 'subject' => 'Keys', 'body' => 'Use AKIAJ3Q7ZB5N2XWV4LTR and DB_PASSWORD=hunter2hunter2 today.']]]);
        $this->admit('Read the keys mail.');
        $claimed = $this->claim();
        $raw = $this->callTool($claimed, 'gmail_read', $gmail, ['id' => 'msg00001'], 'r1')->assertOk()->json('action.result.body');
        $this->assertStringContainsString('AKIAJ3Q7ZB5N2XWV4LTR', $raw);
        $this->depth(['secret_guard']);
        $masked = $this->runnerAction($claimed, DB::table('agent_tool_actions')->where('call_id', 'r1')->value('id'))->assertOk()->json('action.result.body');
        $this->assertSame('Use [redacted:aws_access_key] and DB_PASSWORD=[redacted:secret_assignment] today.', $masked);
        $again = $this->callTool($claimed, 'gmail_read', $gmail, ['id' => 'msg00001'], 'r1')->assertOk()->json('action.result.body');
        $this->assertSame($masked, $again, 'A replayed call is masked too.');
    }

    public function test_with_the_guard_off_the_history_a_runner_receives_is_untouched(): void
    {
        $this->admit('First.');
        $first = $this->claim();
        $this->complete($first, 'Your key is AKIAJ3Q7ZB5N2XWV4LTR.')->assertOk();
        $this->admit('Second.');
        $this->assertSame([false, 'Your key is AKIAJ3Q7ZB5N2XWV4LTR.'], [$this->peekClaim('guard.secrets'), $this->peekClaim('history.0.answer')]);
    }

    private function peekClaim(string $path)
    {
        $json = $this->postJson($this->runnerPath('/claim'), [], $this->runnerHeaders())->assertOk();
        DB::table('agent_runs')->where('state', 'starting')->update(['state' => 'queued', 'lease_expires_at' => null]);
        return $json->json('run.'.$path);
    }

    public function test_earlier_answers_are_masked_in_the_history_and_the_claim_says_the_guard_is_on(): void
    {
        $this->depth(['secret_guard']);
        $this->admit('First.');
        $first = $this->claim();
        $this->complete($first, 'Your key is AKIAJ3Q7ZB5N2XWV4LTR.')->assertOk();
        $this->admit('Second.');
        $this->assertSame([true, 'Your key is [redacted:aws_access_key].'], [$this->peekClaim('guard.secrets'), $this->peekClaim('history.0.answer')]);
    }

    public function test_notifications_carry_fixed_words_never_the_answer(): void
    {
        config(['agents_v2.notifications' => true, 'intelligence.inbox' => true]);
        $this->depth(['secret_guard']);
        $this->admit('Tell me the key.');
        $claimed = $this->claim();
        $this->complete($claimed, 'It is AKIAJ3Q7ZB5N2XWV4LTR.')->assertOk();
        $items = DB::table('notification_items')->where('user_id', $this->user->id)->get();
        $this->assertCount(1, $items);
        $this->assertSame('Inbox finished', $items[0]->title);
        $this->assertStringNotContainsString('AKIA', json_encode($items->all()).json_encode(DB::table('work_events')->get()->all()));
    }
}
