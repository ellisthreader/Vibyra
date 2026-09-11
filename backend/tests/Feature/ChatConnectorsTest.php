<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class ChatConnectorsTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'integration-test-token';

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'chat_connectors.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        $this->withToken($this->token);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
    }

    private function connectGithub(): void
    {
        Http::fake(['api.github.com/user' => Http::response(['login' => 'ellis'])]);
        $this->postJson('/api/connectors/github/connect', ['credential' => 'github_pat_example'])->assertOk();
    }

    public function test_the_catalogue_is_readable_without_an_account_and_never_returns_a_credential(): void
    {
        $body = $this->withToken('')->getJson('/api/connectors')->assertOk()->json();
        $this->assertSame(['github', 'stripe'], array_column($body['integrations'], 'id'));
        foreach ($body['integrations'] as $integration) {
            $this->assertFalse($integration['installed']);
            $this->assertArrayNotHasKey('credential_value', $integration);
            $this->assertSame(['kind', 'signsIn', 'label', 'placeholder', 'help', 'url'], array_keys($integration['credential']));
            // With no sign-in configured on this server, every entry is connected with a key.
            $this->assertSame('token', $integration['credential']['kind']);
        }
        $entries = array_column($body['integrations'], null, 'id');
        // Every integration can change something, and each says what in a sentence
        // of its own - a shared one would be the sort of blanket reassurance this page
        // exists to avoid. The `writes` prose is what a person reads before pasting a
        // key, so an empty one is a page that quietly under-promises.
        foreach ($entries as $slug => $entry) {
            $this->assertIsString($entry['writes'], $slug.' must say what it can change');
            $this->assertNotSame('', trim($entry['writes']), $slug.' must say what it can change');
        }
        $this->assertStringContainsString('touches no code', (string) $entries['github']['writes']);
        $this->assertStringContainsString('cannot charge', (string) $entries['stripe']['writes']);
        // Searching issues needs Issues read even on a token that never writes.
        $this->assertStringContainsString('Contents, Issues and Pull requests', $entries['github']['credential']['help']);
    }

    /**
     * Every catalogue entry has to be reachable and every tool it offers has to be
     * routable back to it, or a reply could be offered a tool nothing can answer.
     */
    public function test_every_listed_integration_owns_the_tools_it_offers(): void
    {
        $registry = app(\App\Services\ChatConnectors\Registry::class);
        $seen = [];
        foreach ($registry->slugs() as $slug) {
            $this->assertNotSame('', (string) config('chat_connectors.catalogue.'.$slug.'.name'));
            $tools = array_column(array_column($registry->for($slug)->definitions(), 'function'), 'name');
            $this->assertNotEmpty($tools, $slug.' is in the catalogue but offers no tools');
            foreach ($tools as $name) {
                $this->assertSame($slug, $registry->ownerOf($name), $name.' does not route back to '.$slug);
                $this->assertArrayNotHasKey($name, $seen, $name.' is offered by two integrations');
                $seen[$name] = $slug;
            }
        }
        $this->assertSame(count($registry->slugs()), count(array_unique($seen)));
    }

    /**
     * The page promises, in a sentence, what an integration can change. This is the
     * test that keeps that sentence true: a connector that grows a write tool and
     * leaves `writes` null fails here rather than shipping a page that says it only
     * looks. It is the one claim on that page nobody can check for themselves.
     */
    public function test_anything_that_can_change_something_says_so_in_the_catalogue(): void
    {
        $registry = app(\App\Services\ChatConnectors\Registry::class);
        foreach ($registry->slugs() as $slug) {
            $connector = $registry->for($slug);
            $tools = array_column(array_column($connector->definitions(), 'function'), 'name');
            $writes = $connector->writes();
            $this->assertSame([], array_diff($writes, $tools), $slug.' declares a write it does not offer');

            $sentence = config('chat_connectors.catalogue.'.$slug.'.writes');
            if ($writes) {
                $this->assertIsString($sentence, $slug.' can change something and does not say so');
                $this->assertNotSame('', trim($sentence));
            } else {
                $this->assertNull($sentence, $slug.' says it changes something but offers no write');
            }
        }
    }

    public function test_a_key_is_proved_before_it_is_stored_and_is_encrypted_at_rest(): void
    {
        // One stub for both attempts: a second Http::fake would not replace the first.
        Http::fake(['api.github.com/user' => Http::sequence()->push([], 401)->push(['login' => 'ellis'])]);
        $this->postJson('/api/connectors/github/connect', ['credential' => 'wrong'])->assertStatus(422);
        $this->assertDatabaseCount('vibes_integration_installs', 0);

        $this->postJson('/api/connectors/github/connect', ['credential' => 'github_pat_example'])->assertOk();
        $row = DB::table('vibes_integration_installs')->first();
        $this->assertSame('@ellis', $row->account_label);
        $this->assertStringNotContainsString('github_pat_example', (string) $row->credential);
        $this->getJson('/api/connectors')->assertJsonPath('integrations.0.installed', true)->assertJsonPath('integrations.0.account', '@ellis');
    }

    public function test_disconnecting_removes_the_stored_account(): void
    {
        $this->connectGithub();
        $this->postJson('/api/connectors/github/disconnect')->assertOk()->assertJsonPath('integrations.0.installed', false);
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_connecting_is_refused_while_the_feature_is_off(): void
    {
        config(['chat_connectors.enabled' => false]);
        $this->postJson('/api/connectors/github/connect', ['credential' => 'github_pat_example'])->assertStatus(503);
        // The menu still answers, because reading it spends nothing.
        $this->getJson('/api/connectors')->assertOk()->assertJsonPath('enabled', false);
    }

    private function chat(): string
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Integrations'])->assertOk();
        return $id;
    }

    public function test_only_a_connected_integration_is_attached_to_a_quote(): void
    {
        $chat = $this->chat();
        $body = ['chatId' => $chat, 'text' => 'What is open?', 'model' => 'qwen/qwen3.8-flash', 'integrations' => ['github']];
        // Named but not connected, so nothing is attached and nothing extra is charged.
        $this->postJson('/api/vibes/quote', $body)->assertOk()->assertJsonPath('integrations', []);
        $this->connectGithub();
        $this->postJson('/api/vibes/quote', $body)->assertOk()->assertJsonPath('integrations', ['github']);
        // An unknown slug is dropped rather than refused, so a stale app cannot fail a send.
        $this->postJson('/api/vibes/quote', [...$body, 'integrations' => ['github', 'nonsense']])
            ->assertOk()->assertJsonPath('integrations', ['github']);
    }

    public function test_an_integration_call_is_answered_by_the_server_and_the_reply_finishes(): void
    {
        $this->connectGithub();
        $chat = $this->chat();
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'What issues mention crash?',
            'model' => 'qwen/qwen3.8-flash', 'integrations' => ['github']])->assertOk()->json();
        $id = (string) Str::uuid();

        Http::fake([
            'openrouter.ai/*' => Http::sequence()
                ->push(['id' => 'gen-one', 'usage' => ['cost' => 0.002], 'choices' => [['message' => [
                    'role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                        'function' => ['name' => 'github_search_issues', 'arguments' => '{"query":"crash"}']]]]]]])
                ->push(['id' => 'gen-two', 'usage' => ['cost' => 0.002], 'choices' => [['message' => ['content' => 'One issue mentions a crash.']]]]),
            'api.github.com/*' => Http::response(['items' => [['number' => 4, 'title' => 'Crash on launch', 'state' => 'open',
                'html_url' => 'https://github.com/ellis/app/issues/4', 'updated_at' => '2026-09-01T00:00:00Z',
                'repository_url' => 'https://api.github.com/repos/ellis/app']]]),
        ]);

        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);

        // The phone was never asked: the call already has an answer and a summary.
        $tool = DB::table('vibes_tools')->where('turn_id', $id)->first();
        $this->assertSame('github', $tool->integration);
        $this->assertSame('auto', $tool->decision);
        $this->assertStringContainsString('Searched GitHub', (string) $tool->summary);
        $this->assertStringContainsString('Crash on launch', (string) $tool->result);
        // Once for the submission and once because the answered call resumed the turn.
        Queue::assertPushed(RunVibesTurn::class, 2);
        $this->assertDatabaseHas('vibes_turns', ['id' => $id, 'status' => 'queued']);

        app()->call([new RunVibesTurn($id), 'handle']);
        $this->getJson('/api/vibes/turns/'.$id)->assertOk()
            ->assertJsonPath('turn.status', 'completed')
            ->assertJsonPath('turn.response', 'One issue mentions a crash.')
            // The transcript gets the one line, never the account data behind it.
            ->assertJsonPath('turn.tools.0.integration', 'github')
            ->assertJsonMissingPath('turn.tools.0.result');
    }

    /**
     * The Stripe write is the one that would be billed for twice if it ran twice,
     * so an email that already has a customer gets that customer back rather than
     * a second one. A model retrying a call it was unsure about is the normal case.
     */
    public function test_creating_a_stripe_customer_never_makes_a_second_one_for_the_same_email(): void
    {
        Http::fake([
            'api.stripe.com/v1/account' => Http::response(['id' => 'acct_1', 'business_profile' => ['name' => 'Vibyra']]),
            'api.stripe.com/v1/customers?*' => Http::sequence()
                // Looked up before the first create: nothing there yet, then there is.
                ->push(['data' => []])->push(['data' => [['id' => 'cus_1', 'email' => 'buyer@example.com']]]),
            'api.stripe.com/v1/customers' => Http::response(['id' => 'cus_1', 'email' => 'buyer@example.com', 'name' => 'Buyer']),
        ]);
        $this->postJson('/api/connectors/stripe/connect', ['credential' => 'rk_live_example'])->assertOk();

        $tools = app(\App\Services\ChatConnectors\ConnectorTools::class);
        $user = \App\Models\User::first();
        $arguments = ['email' => 'buyer@example.com', 'name' => 'Buyer'];

        $first = $tools->run($user->id, 'stripe', 'stripe_create_customer', $arguments);
        $this->assertTrue($first['result']['created']);
        $this->assertSame('Created the Stripe customer buyer@example.com', $first['summary']);

        $again = $tools->run($user->id, 'stripe', 'stripe_create_customer', $arguments);
        $this->assertFalse($again['result']['created']);
        $this->assertSame('cus_1', $again['result']['id']);
        $this->assertStringContainsString('already had a customer', $again['summary']);
    }

    /** An address that is not an address is refused before Stripe is ever called. */
    public function test_a_stripe_customer_needs_a_real_email_address(): void
    {
        Http::fake();
        $this->expectExceptionMessage('A Stripe customer needs a real email address.');
        app(\App\Services\ChatConnectors\ConnectorTools::class)
            ->validate('stripe', 'stripe_create_customer', ['email' => 'not-an-address']);
    }

    private function withGithubSignIn(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.github.oauth.client_id' => 'gh-client',
            'chat_connectors.catalogue.github.oauth.client_secret' => 'gh-secret']);
    }

    /** Opens the provider's page with everything it needs, and keeps the state for the callback. */
    private function startGithub(string $returnUrl = 'vibyra://integrations/connected'): array
    {
        $start = $this->postJson('/api/connectors/github/start', ['returnUrl' => $returnUrl])->assertOk()->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        return [$start, $query];
    }

    public function test_signing_in_is_offered_only_where_this_server_can_complete_it(): void
    {
        $refused = $this->postJson('/api/connectors/github/start')->assertStatus(422);
        // Laravel words an abort as `message`; the app reads `error` first, then `message`.
        $this->assertSame('Signing in to GitHub is not set up on this server yet.', $refused->json('error') ?? $refused->json('message'));
        $this->withGithubSignIn();
        $entries = array_column($this->getJson('/api/connectors')->json('integrations'), null, 'id');
        $this->assertSame('oauth', $entries['github']['credential']['kind']);
        $this->assertSame('token', $entries['stripe']['credential']['kind']);
    }

    public function test_the_sign_in_page_is_github_s_own_with_a_single_use_state(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        $this->assertStringStartsWith('https://github.com/login/oauth/authorize?', $start['url']);
        $this->assertSame('gh-client', $query['client_id']);
        $this->assertSame('https://vibyra.test/api/connectors/callback/github', $query['redirect_uri']);
        $this->assertSame('repo user:email', $query['scope']);
        $this->assertSame(48, strlen($query['state']));
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'pending');
    }

    /**
     * The whole round trip: GitHub sends the browser back with a code, the code
     * becomes a token that is proved and stored encrypted like a pasted key, and the
     * browser is sent on to the app with the outcome, which the app can read back.
     */
    public function test_a_github_sign_in_connects_the_account_and_returns_to_the_app(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in', 'token_type' => 'bearer']),
            'api.github.com/user' => Http::response(['login' => 'ellis']),
        ]);
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
        Http::assertSent(fn ($request) => $request->url() === 'https://github.com/login/oauth/access_token'
            && $request['code'] === 'the-code' && $request['client_secret'] === 'gh-secret'
            && $request['redirect_uri'] === 'https://vibyra.test/api/connectors/callback/github');
        $row = DB::table('vibes_integration_installs')->first();
        $this->assertSame('@ellis', $row->account_label);
        $this->assertStringNotContainsString('gho_signed_in', (string) $row->credential);
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status', 'connected')
            ->assertJsonPath('catalogue.integrations.0.installed', true)->assertJsonPath('catalogue.integrations.0.account', '@ellis');

        // The state was single-use: replaying the same callback connects nothing again.
        DB::table('vibes_integration_installs')->delete();
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])->assertOk()->assertSee('GitHub was not connected');
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_cancelling_on_github_returns_to_the_app_and_says_so(): void
    {
        $this->withGithubSignIn();
        [$start, $query] = $this->startGithub();
        Http::fake();
        $this->get('/api/connectors/callback/github?error=access_denied&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=failed');
        $this->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('error', 'You cancelled the sign-in.');
        Http::assertNothingSent();
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    /** The browser is only ever sent back into the app, never on to a web page someone supplied. */
    public function test_a_sign_in_never_redirects_anywhere_but_the_app(): void
    {
        $this->withGithubSignIn();
        [, $query] = $this->startGithub('https://evil.example/steal');
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in']),
            'api.github.com/user' => Http::response(['login' => 'ellis']),
        ]);
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertOk()->assertSee('GitHub is connected');
    }

    public function test_one_account_cannot_read_another_account_s_sign_in(): void
    {
        $this->withGithubSignIn();
        [$start] = $this->startGithub();
        $other = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'someone-else'), 'device_name' => 'iPhone']);
        $this->withToken('someone-else')->getJson('/api/connectors/flows/'.$start['flowId'])->assertJsonPath('status', 'expired');
    }

    /** Stripe's token endpoint refuses fields it does not expect, so it is sent only its three. */
    public function test_a_stripe_sign_in_sends_its_token_endpoint_only_what_it_takes(): void
    {
        config(['app.url' => 'https://vibyra.test', 'chat_connectors.catalogue.stripe.oauth.client_id' => 'ca_platform',
            'chat_connectors.catalogue.stripe.oauth.client_secret' => 'sk_platform']);
        $start = $this->postJson('/api/connectors/stripe/start', ['returnUrl' => 'exp://127.0.0.1:8082/--/integrations'])->json();
        $this->assertStringStartsWith('https://connect.stripe.com/oauth/authorize?', $start['url']);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertSame('read_write', $query['scope']);
        Http::fake([
            'connect.stripe.com/oauth/token' => Http::response(['access_token' => 'sk_connected', 'stripe_user_id' => 'acct_1']),
            'api.stripe.com/v1/account' => Http::response(['id' => 'acct_1', 'business_profile' => ['name' => 'Vibyra']]),
        ]);
        $this->get('/api/connectors/callback/stripe?code=ac_code&state='.$query['state'])
            ->assertRedirect('exp://127.0.0.1:8082/--/integrations?flow='.$start['flowId'].'&status=connected');
        Http::assertSent(fn ($request) => $request->url() === 'https://connect.stripe.com/oauth/token'
            && array_keys($request->data()) === ['client_secret', 'code', 'grant_type']);
        $this->assertSame('Vibyra', DB::table('vibes_integration_installs')->first()->account_label);
    }

    /** GitHub answers for a person who is not yet a Vibyra user: who they are, and their verified email. */
    private function fakeGithubIdentity(string $email = 'new-person@example.com'): void
    {
        Http::fake([
            'github.com/login/oauth/access_token' => Http::response(['access_token' => 'gho_signed_in', 'token_type' => 'bearer']),
            'api.github.com/user/emails' => Http::response([
                ['email' => 'old@example.com', 'primary' => false, 'verified' => true],
                ['email' => $email, 'primary' => true, 'verified' => true],
            ]),
            'api.github.com/user' => Http::response(['id' => 4242, 'login' => 'newperson', 'name' => 'New Person']),
        ]);
    }

    /**
     * Connecting GitHub from a signed-out phone never stops at a Vibyra login page:
     * GitHub's identity makes the Vibyra account, the phone is handed a session,
     * and the connection belongs to that account.
     */
    public function test_a_signed_out_github_sign_in_makes_the_account_signs_in_and_connects(): void
    {
        $this->withGithubSignIn();
        $entry = array_column($this->withToken('')->getJson('/api/connectors')->json('integrations'), null, 'id')['github'];
        $this->assertTrue($entry['credential']['signsIn']);
        $start = $this->withToken('')->postJson('/api/connectors/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->assertOk()->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertSame('repo user:email', $query['scope']);
        $this->fakeGithubIdentity();

        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=connected');
        $person = User::where('email', 'new-person@example.com')->firstOrFail();
        $this->assertSame(['github', '4242', 'New Person'], [$person->provider, (string) $person->provider_id, $person->name]);
        $this->assertNotNull($person->email_verified_at);
        $this->assertSame($person->id, (int) DB::table('vibes_integration_installs')->value('user_id'));

        // The phone that began it reads the session back, and that session is the person.
        $flow = $this->withToken('')->getJson('/api/connectors/flows/'.$start['flowId'])->assertOk()
            ->assertJsonPath('status', 'connected')->assertJsonPath('session.user.email', 'new-person@example.com')
            ->assertJsonPath('catalogue.integrations.0.installed', true)->json();
        $this->withToken($flow['session']['token'])->getJson('/api/connectors')
            ->assertJsonPath('integrations.0.installed', true)->assertJsonPath('integrations.0.account', '@newperson');
    }

    /**
     * The same rule as Apple and Google: a GitHub email that already has a Vibyra
     * account does not quietly sign in to it, because that would let a GitHub login
     * stand in for that account's own password.
     */
    public function test_a_signed_out_github_sign_in_never_takes_over_an_existing_account(): void
    {
        $this->withGithubSignIn();
        User::factory()->create(['email' => 'taken@example.com', 'email_verified_at' => now()]);
        $start = $this->withToken('')->postJson('/api/connectors/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->fakeGithubIdentity('taken@example.com');
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state'])
            ->assertRedirect('vibyra://integrations/connected?flow='.$start['flowId'].'&status=failed');
        $this->withToken('')->getJson('/api/connectors/flows/'.$start['flowId'])
            ->assertJsonPath('error', 'An account already exists for that email. Log in with its original method.')
            ->assertJsonMissingPath('session');
        $this->assertDatabaseCount('vibes_integration_installs', 0);
        $this->assertSame(1, User::where('email', 'taken@example.com')->count());
    }

    /** An account GitHub made has no password and no identity token, and must still be deletable in the app. */
    public function test_an_account_github_made_can_be_deleted_from_its_session(): void
    {
        $this->withGithubSignIn();
        $start = $this->withToken('')->postJson('/api/connectors/github/start', ['returnUrl' => 'vibyra://integrations/connected'])->json();
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->fakeGithubIdentity();
        $this->get('/api/connectors/callback/github?code=the-code&state='.$query['state']);
        $token = $this->withToken('')->getJson('/api/connectors/flows/'.$start['flowId'])->json('session.token');

        $this->withToken($token)->deleteJson('/api/account')->assertOk();
        $this->assertDatabaseMissing('users', ['email' => 'new-person@example.com']);
        $this->assertDatabaseCount('vibes_integration_installs', 0);
    }

    public function test_stripe_cannot_be_started_signed_out_because_it_cannot_sign_anyone_in(): void
    {
        config(['chat_connectors.catalogue.stripe.oauth.client_id' => 'ca_platform', 'chat_connectors.catalogue.stripe.oauth.client_secret' => 'sk_platform']);
        $refused = $this->withToken('')->postJson('/api/connectors/stripe/start')->assertStatus(401);
        $this->assertSame('Sign in to Vibyra to connect Stripe.', $refused->json('error') ?? $refused->json('message'));
    }
}
