<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Services\Agents\{TaskContext, Teammates, ToolActions};
use App\Services\ChatConnectors\{ConnectorTools, Installs};
use App\Services\Vibes\{Quotes, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

/**
 * A teammate that cannot reach a service the person expects should say why and
 * point at the one fix. These cover what the quote tells the model, that a
 * disconnect never leaves a grant behind, and that a dead sign-in reads as such.
 */
class AgentAccessNotesTest extends TestCase
{
    use RefreshDatabase;

    private int $user;
    private string $chat;
    private string $agent;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'agents.enabled' => true, 'chat_connectors.enabled' => true,
            'services.openrouter.key' => 'test-only', 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Queue::fake();
        Http::preventStrayRequests();
        VibesCatalogue::put();
        $user = User::factory()->create();
        $this->user = $user->id;
        app(Wallet::class)->ensure($user);
        app(Wallet::class)->grant($this->user, 'access-notes-test', 'topup', 500);
        DB::table('vibes_wallets')->where('user_id', $this->user)->update(['consented_at' => now()]);
        $saved = $this->teammate($this->user, []);
        $this->chat = $saved['chatId'];
        $this->agent = $saved['id'];
    }

    private function teammate(int $user, array $grants): array
    {
        return app(Teammates::class)->save($user, ['id' => (string) Str::uuid(), 'name' => 'Assistant',
            'brief' => 'Keep my day in order.', 'avatar' => 'assistant', 'budget' => 20, 'integrations' => $grants]);
    }

    private function install(int $user, string $slug, array $extra = []): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $user, 'integration' => $slug,
            'credential' => Crypt::encryptString('fixture-token'), 'account_label' => 'Fixture',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now(), ...$extra]);
    }

    private function grant(array $grants): void
    {
        DB::table('agent_teammates')->where('id', $this->agent)->update(['integrations' => json_encode($grants)]);
    }

    private function system(string $text): string
    {
        $quote = app(Quotes::class)->create($this->user, $this->chat, $text, 'auto');
        $data = json_decode(Crypt::decryptString($quote['quote']), true);
        return $data['request']['messages'][0]['content'];
    }

    public function test_a_grant_without_a_connection_is_reported_as_needing_a_reconnect(): void
    {
        $this->grant(['gmail']);
        $system = $this->system('Look at my inbox.');
        $this->assertStringContainsString("Access notes: Gmail is granted to you but the person's connection is missing or expired", $system);
        $this->assertStringContainsString('reconnect it in Settings → Integrations', $system);
        $this->assertStringNotContainsString('not allowed for you', $system);
    }

    public function test_a_connection_the_teammate_may_not_use_is_reported_with_where_to_allow_it(): void
    {
        $this->install($this->user, 'google_calendar');
        $system = $this->system('What is on my calendar?');
        $this->assertStringContainsString('Google Calendar is connected but not allowed for you', $system);
        $this->assertStringContainsString('Details → Access', $system);
        $this->assertStringNotContainsString('Settings → Integrations', $system);
    }

    public function test_a_grant_left_out_by_the_cap_is_named_as_not_attached(): void
    {
        config(['chat_connectors.max_per_turn' => 1]);
        $this->install($this->user, 'gmail');
        $this->install($this->user, 'google_calendar');
        $this->grant(['gmail', 'google_calendar']);
        $system = $this->system('Check my emails and my calendar.');
        $this->assertStringContainsString('Not attached to this task: Google Calendar — name it to bring it in.', $system);
        $this->assertStringNotContainsString('granted to you but', $system);
    }

    public function test_nothing_is_said_when_everything_granted_is_attached(): void
    {
        $this->install($this->user, 'gmail');
        $this->grant(['gmail']);
        $this->assertStringNotContainsString('Access notes', $this->system('Summarise my emails.'));
        $this->assertSame('', TaskContext::accessNotes([], [], []));
    }

    public function test_notes_use_plurals_and_catalogue_names(): void
    {
        $notes = TaskContext::accessNotes(['gmail', 'slack'], [], []);
        $this->assertStringContainsString('Gmail, Slack are granted to you', $notes);
    }

    public function test_a_follow_up_still_reaches_gmail_when_the_message_names_another_service(): void
    {
        config(['chat_connectors.max_per_turn' => 2]);
        foreach (['gmail', 'slack', 'linear'] as $slug) $this->install($this->user, $slug);
        $this->grant(['linear', 'slack', 'gmail']);
        DB::table('vibes_turns')->insert(['id' => (string) Str::uuid(), 'chat_id' => $this->chat, 'user_id' => $this->user,
            'prompt' => 'Summarise my unread emails', 'digest' => str_repeat('0', 64), 'model' => 'qwen/qwen3.8-flash', 'request' => '{}', 'allocations' => '[]',
            'reserved' => 1, 'response' => 'Done.', 'status' => 'completed',
            'settled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $quote = app(Quotes::class)->create($this->user, $this->chat, 'and post it in Slack?', 'auto');
        $this->assertSame(['slack', 'gmail'], $quote['integrations']);
    }

    public function test_disconnect_removes_the_grant_and_invalidates_in_flight_work_for_that_user_only(): void
    {
        $other = User::factory()->create();
        app(Wallet::class)->ensure($other);
        $this->install($this->user, 'gmail');
        $this->install($this->user, 'slack');
        $this->install($other->id, 'gmail');
        $this->grant(['gmail', 'slack']);
        $mine = DB::table('agent_teammates')->where('id', $this->agent)->first();
        $bystander = $this->teammate($this->user, ['slack']);
        $theirs = $this->teammate($other->id, ['gmail']);
        $meta = TaskContext::metadata($mine);
        $before = (int) DB::table('vibes_chats')->where('id', $this->chat)->value('revision');

        app(Installs::class)->disconnect($this->user, 'gmail');

        $row = DB::table('agent_teammates')->where('id', $this->agent)->first();
        $this->assertSame(['slack'], json_decode($row->integrations, true));
        $this->assertSame((int) $mine->revision + 1, (int) $row->revision);
        $this->assertSame($before + 1, (int) DB::table('vibes_chats')->where('id', $this->chat)->value('revision'));
        $this->assertSame(0, DB::table('vibes_integration_installs')->where('user_id', $this->user)->where('integration', 'gmail')->count());
        // A teammate that never held it, and another person's, are untouched.
        $this->assertSame((int) $bystander['revision'], (int) DB::table('agent_teammates')->where('id', $bystander['id'])->value('revision'));
        $this->assertSame(['slack'], json_decode(DB::table('agent_teammates')->where('id', $bystander['id'])->value('integrations'), true));
        $this->assertSame(['gmail'], json_decode(DB::table('agent_teammates')->where('id', $theirs['id'])->value('integrations'), true));
        $this->assertSame(1, DB::table('vibes_integration_installs')->where('user_id', $other->id)->count());
        $this->assertSame((int) $theirs['revision'], (int) DB::table('agent_teammates')->where('id', $theirs['id'])->value('revision'));
        // The turn quoted before the disconnect can no longer run or be approved.
        try { TaskContext::validate($this->user, $meta); $this->fail('A stale revision must be refused.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
    }

    public function test_a_refused_renewal_says_reconnect_and_never_shows_a_token(): void
    {
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => 'google-id',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'google-secret']);
        $this->install($this->user, 'gmail', ['refresh_token' => Crypt::encryptString('refresh-secret'), 'expires_at' => now()->subDay()]);
        Http::fake(['oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400),
            'gmail.googleapis.com/*' => Http::response(['error' => 'unauthorized'], 401)]);

        $out = app(ConnectorTools::class)->run($this->user, 'gmail', 'gmail_search', ['query' => 'is:unread']);

        $this->assertStringContainsString('reconnect', $out['result']['error']);
        $this->assertStringContainsString('Settings → Integrations', $out['result']['error']);
        $this->assertStringNotContainsString('could not be reached', $out['result']['error']);
        $this->assertStringNotContainsString('refresh-secret', json_encode($out));
        $this->assertStringNotContainsString('fixture-token', json_encode($out));
        // Recorded so a later failing call keeps naming the fix.
        $this->assertTrue(app(Installs::class)->needsReconnect($this->user, 'gmail'));
    }

    public function test_a_provider_401_says_reconnect(): void
    {
        $this->install($this->user, 'gmail');
        Http::fake(['gmail.googleapis.com/*' => Http::response(['error' => 'unauthorized'], 401)]);
        $out = app(ConnectorTools::class)->run($this->user, 'gmail', 'gmail_search', ['query' => 'a']);
        $this->assertStringContainsString('reconnect', $out['result']['error']);
        $this->assertStringContainsString('reconnected', $out['summary']);
    }

    public function test_an_outage_still_reads_as_an_outage(): void
    {
        $this->install($this->user, 'gmail');
        Http::fake(['gmail.googleapis.com/*' => Http::response(['error' => 'down'], 503)]);
        $out = app(ConnectorTools::class)->run($this->user, 'gmail', 'gmail_search', ['query' => 'a']);
        $this->assertSame('Gmail could not be reached just now.', $out['result']['error']);
    }

    private function quoteData(string $text): array
    {
        $quote = app(Quotes::class)->create($this->user, $this->chat, $text, 'auto');
        return json_decode(Crypt::decryptString($quote['quote']), true);
    }

    private function toolNames(array $data): array
    {
        return array_map(fn ($tool) => $tool['function']['name'], $data['request']['tools'] ?? []);
    }

    public function test_a_granted_and_connected_gmail_reaches_the_model_and_its_answer_is_shaped_for_it(): void
    {
        $this->install($this->user, 'gmail');
        $this->grant(['gmail']);
        $data = $this->quoteData('Can you summarize my latest emails?');
        $this->assertContains('gmail_search', $this->toolNames($data));
        $this->assertContains('gmail_read', $this->toolNames($data));
        $system = $data['request']['messages'][0]['content'];
        $this->assertStringContainsString('connected services are available to this task: Gmail', $system);
        $this->assertStringNotContainsString('Access notes', $system);

        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push(['id' => 'gen-one', 'usage' => ['cost' => 0.002], 'choices' => [['message' => ['role' => 'assistant',
                    'content' => null, 'tool_calls' => [['id' => 'call-mail', 'type' => 'function',
                        'function' => ['name' => 'gmail_search', 'arguments' => '{"query":"in:inbox"}']]]]]]])
                ->push(['id' => 'gen-two', 'usage' => ['cost' => 0.002], 'choices' => [['message' => ['content' => 'One email: the invoice.']]]]),
            'gmail.googleapis.com/gmail/v1/users/me/messages?*' => Http::response(['messages' => [['id' => 'm1', 'threadId' => 't1']]]),
            'gmail.googleapis.com/gmail/v1/users/me/messages/m1*' => Http::response(['id' => 'm1', 'threadId' => 't1',
                'snippet' => 'Your invoice is attached', 'payload' => ['headers' => [
                    ['name' => 'From', 'value' => 'Billing <billing@example.com>'], ['name' => 'Subject', 'value' => 'September invoice'],
                    ['name' => 'Date', 'value' => 'Mon, 28 Sep 2026 09:00:00 +0000']]]]),
        ]);
        $turn = (string) Str::uuid();
        app(Turns::class)->submit($this->user, $turn, $data);
        app()->call([new RunVibesTurn($turn), 'handle']);
        $tool = DB::table('vibes_tools')->where('turn_id', $turn)->firstOrFail();
        $this->assertSame('gmail', $tool->integration);
        // A teammate turn is prepared for its queued action rather than answered inline.
        app(ToolActions::class)->execute($tool->id);
        app()->call([new RunVibesTurn($turn), 'handle']);

        $this->assertDatabaseHas('vibes_turns', ['id' => $turn, 'status' => 'completed', 'response' => 'One email: the invoice.']);
        $result = (string) DB::table('vibes_tools')->where('id', $tool->id)->value('result');
        $this->assertStringContainsString('September invoice', $result);
        $this->assertStringContainsString('billing@example.com', $result);
        $this->assertStringNotContainsString('fixture-token', $result);
        // The model's second step was sent that shaped result, not a refusal.
        Http::assertSent(fn ($request) => str_contains($request->url(), 'openrouter.ai')
            && str_contains(json_encode($request->data()), 'September invoice'));
    }

    public function test_gmail_connected_but_not_granted_sends_no_tools_and_says_where_to_allow_it(): void
    {
        $this->install($this->user, 'gmail');
        $data = $this->quoteData('Can you summarize my latest emails?');
        $this->assertSame([], array_values(array_filter($this->toolNames($data), fn ($n) => str_starts_with($n, 'gmail_'))));
        $system = $data['request']['messages'][0]['content'];
        $this->assertStringContainsString('Gmail is connected but not allowed for you', $system);
        $this->assertStringContainsString('Details → Access', $system);
    }

    public function test_gmail_granted_but_its_connection_deleted_sends_no_tools_and_says_reconnect(): void
    {
        $this->install($this->user, 'gmail');
        $this->grant(['gmail']);
        DB::table('vibes_integration_installs')->where('user_id', $this->user)->delete();
        $data = $this->quoteData('Can you summarize my latest emails?');
        $this->assertSame([], array_values(array_filter($this->toolNames($data), fn ($n) => str_starts_with($n, 'gmail_'))));
        $system = $data['request']['messages'][0]['content'];
        $this->assertStringContainsString("Gmail is granted to you but the person's connection is missing or expired", $system);
        $this->assertStringContainsString('reconnect it in Settings → Integrations', $system);
    }

    /** @return array<string, array{0: string, 1: string, 2: array, 3: array}> */
    public static function deadSignIns(): array
    {
        return [
            'slack revoked' => ['slack', 'slack_channels', [], ['slack.com/api/*' => ['ok' => false, 'error' => 'token_revoked']]],
            'notion 401' => ['notion', 'notion_search', ['query' => 'plan'], ['api.notion.com/*' => 401]],
            'linear 401' => ['linear', 'linear_teams', [], ['api.linear.app/*' => 401]],
            'linear auth error' => ['linear', 'linear_teams', [], ['api.linear.app/*' => ['errors' => [['extensions' => ['code' => 'AUTHENTICATION_ERROR']]]]]],
            'google tasks 401' => ['google_tasks', 'google_tasks_lists', [], ['tasks.googleapis.com/*' => 401]],
            'google calendar 401' => ['google_calendar', 'google_calendar_upcoming', [], ['www.googleapis.com/*' => 401]],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('deadSignIns')]
    public function test_a_dead_sign_in_at_any_provider_says_reconnect(string $slug, string $operation, array $arguments, array $fake): void
    {
        $this->install($this->user, $slug);
        Http::fake(array_map(fn ($body) => is_int($body) ? Http::response(['error' => 'unauthorized'], $body) : Http::response($body, 200), $fake));
        $tools = app(ConnectorTools::class);
        $out = $tools->run($this->user, $slug, $operation, $tools->validate($slug, $operation, $arguments));
        $this->assertStringContainsString('Settings → Integrations', $out['result']['error']);
        $this->assertStringContainsString('reconnected', $out['summary']);
        $this->assertStringNotContainsString('could not be reached', $out['result']['error']);
        $this->assertStringNotContainsString('fixture-token', json_encode($out));
    }

    public function test_a_slack_error_that_is_not_about_the_sign_in_stays_a_plain_refusal(): void
    {
        $this->install($this->user, 'slack');
        Http::fake(['slack.com/api/*' => Http::response(['ok' => false, 'error' => 'channel_not_found'])]);
        $out = app(ConnectorTools::class)->run($this->user, 'slack', 'slack_channels', []);
        $this->assertStringNotContainsString('Settings → Integrations', $out['result']['error']);
        $this->assertSame('Slack could not be reached just now.', $out['result']['error']);
    }

    public function test_a_pasted_key_the_provider_rejects_is_refused_as_a_wrong_key_not_an_expiry(): void
    {
        Http::fake(['slack.com/api/*' => Http::response(['ok' => false, 'error' => 'invalid_auth'])]);
        try { app(Installs::class)->connect($this->user, 'slack', 'xoxb-typo'); $this->fail('A rejected key must not be stored.'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('refused that sign-in', $e->getMessage());
            $this->assertStringNotContainsString('expired', $e->getMessage());
        }
        $this->assertSame(0, DB::table('vibes_integration_installs')->where('user_id', $this->user)->count());
    }
}
