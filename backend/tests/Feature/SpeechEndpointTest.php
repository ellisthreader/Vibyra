<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SpeechEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.openai.key' => 'test-key', 'speech.usd_per_1k_chars' => 0.015]);
    }

    public function test_it_reads_text_aloud_and_charges_the_account(): void
    {
        Http::fake(['api.openai.com/*' => Http::response('ID3-audio-bytes', 200, ['Content-Type' => 'audio/mpeg'])]);
        [$token, $userId] = $this->signupUser('speaker@example.com');
        $before = (int) DB::table('users')->where('id', $userId)->value('credits_balance');

        $response = $this->post('/api/speech', [
            'text' => 'The workspace is ready.',
            'voice' => 'nova',
        ], ['Authorization' => "Bearer {$token}"]);

        $response->assertOk();
        $this->assertSame('audio/mpeg', $response->headers->get('Content-Type'));
        $this->assertSame('ID3-audio-bytes', $response->getContent());

        // The chosen voice reaches the service; the text never becomes a flag.
        Http::assertSent(function ($request) {
            return $request->url() === 'https://api.openai.com/v1/audio/speech'
                && $request['voice'] === 'nova'
                && $request['input'] === 'The workspace is ready.'
                && $request['response_format'] === 'mp3';
        });

        $after = (int) DB::table('users')->where('id', $userId)->value('credits_balance');
        $this->assertLessThan($before, $after, 'reading aloud is billed to the account');
        $this->assertDatabaseHas('credit_ledger', ['user_id' => $userId, 'kind' => 'speech']);
    }

    public function test_an_unknown_voice_falls_back_instead_of_travelling_upstream(): void
    {
        Http::fake(['api.openai.com/*' => Http::response('audio', 200)]);
        [$token] = $this->signupUser('fallback@example.com');

        $this->post('/api/speech', [
            'text' => 'Hello.',
            'voice' => 'gpt-4o-realtime',
        ], ['Authorization' => "Bearer {$token}"])->assertOk();

        Http::assertSent(fn ($request) => $request['voice'] === 'alloy');
    }

    public function test_a_failed_read_costs_nothing(): void
    {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'Voice unavailable.']], 400)]);
        [$token, $userId] = $this->signupUser('failed@example.com');
        $before = (int) DB::table('users')->where('id', $userId)->value('credits_balance');

        $this->post('/api/speech', ['text' => 'Hello.'], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(502)
            ->assertJsonPath('ok', false)
            ->assertJsonPath('error', 'Voice unavailable.');

        $this->assertSame($before, (int) DB::table('users')->where('id', $userId)->value('credits_balance'));
        $this->assertDatabaseMissing('credit_ledger', ['user_id' => $userId, 'kind' => 'speech']);
    }

    public function test_empty_and_oversized_text_are_refused_before_any_spend(): void
    {
        Http::fake();
        [$token] = $this->signupUser('bounds@example.com');
        $auth = ['Authorization' => "Bearer {$token}"];

        $this->post('/api/speech', ['text' => '   '], $auth)->assertStatus(422);
        $this->post('/api/speech', ['text' => str_repeat('a', 4001)], $auth)->assertStatus(413);
        Http::assertNothingSent();
    }

    public function test_the_voice_list_is_vibyras_own(): void
    {
        [$token] = $this->signupUser('voices@example.com');

        $this->getJson('/api/speech/voices', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('default', 'alloy')
            ->assertJsonFragment(['voices' => [
                'alloy', 'ash', 'ballad', 'coral', 'echo',
                'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
            ]]);
    }

    /** @return array{0:string,1:int} token and user id */
    private function signupUser(string $email): array
    {
        $response = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated();

        return [$response->json('token'), (int) $response->json('user.id')];
    }
}
