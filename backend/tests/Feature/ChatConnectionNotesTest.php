<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * An ordinary chat's model hears what is connected and why a mention did not
 * arrive, so it points at Integrations instead of saying it has no access.
 */
class ChatConnectionNotesTest extends TestCase
{
    use RefreshDatabase;

    private int $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'chat_connectors.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'chat_connectors.catalogue.gmail.oauth.client_id' => 'gmail-client',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'gmail-secret',
            'chat_connectors.catalogue.slack.oauth.client_id' => '']);
        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->user = $user->id;
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'notes-token'), 'device_name' => 'iPhone']);
        $this->withToken('notes-token');
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
        Http::preventStrayRequests();
    }

    private function system(array $mentions, string $text = 'Check my inbox.'): string
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Notes'])->assertOk();
        $quote = $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $text, 'model' => 'qwen/qwen3.8-flash',
            'integrations' => $mentions])->assertOk()->json('quote');
        return json_decode(Crypt::decryptString($quote), true)['request']['messages'][0]['content'];
    }

    private function install(string $slug): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user, 'integration' => $slug,
            'credential' => Crypt::encryptString('fixture-token'), 'account_label' => 'Fixture',
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_mention_of_an_unconnected_service_says_where_to_connect_it(): void
    {
        $system = $this->system(['gmail']);
        $this->assertStringContainsString('Integrations: Gmail was mentioned but is not connected: tell the person to connect it in Integrations', $system);
        $this->assertStringContainsString('No accounts are connected.', $system);
        $this->assertStringContainsString('never just say you have no access', $system);
    }

    public function test_a_service_vibyra_cannot_connect_yet_is_said_plainly(): void
    {
        $this->assertStringContainsString('Slack was mentioned, but Vibyra cannot connect it yet', $this->system(['slack']));
    }

    public function test_connected_services_are_listed_and_an_expired_one_asks_for_a_reconnect(): void
    {
        $this->install('github');
        $this->install('google_calendar');
        Cache::put('chat-connectors:reconnect:'.$this->user.':google_calendar', true, now()->addDay());
        $system = $this->system([], 'What should I do today?');
        $this->assertStringContainsString('Also connected, but only used when the person @mentions it: GitHub.', $system);
        $this->assertStringContainsString('Google Calendar is connected but the sign-in expired', $system);
        $this->assertStringNotContainsString('No accounts are connected.', $system);
    }

    public function test_an_attached_service_is_not_repeated_as_idle(): void
    {
        $this->install('gmail');
        $system = $this->system(['gmail']);
        $this->assertStringContainsString('The following connected services are available to this task: Gmail.', $system);
        $this->assertStringNotContainsString('Also connected', $system);
        $this->assertStringNotContainsString('No accounts are connected.', $system);
    }

    public function test_switched_off_integrations_add_nothing(): void
    {
        config(['chat_connectors.enabled' => false]);
        $this->assertStringNotContainsString('Integrations:', $this->system([]));
    }
}
