<?php

namespace Tests\Feature;

use App\Models\RemoteAuditEvent;
use App\Models\User;
use App\Services\Remote\RelayTokens;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Remote access end to end at the API: a computer registers, the relay reports
 * it online, a phone of the same account takes a grant, and removing the
 * computer cuts it off. Nothing here ever carries terminal content.
 */
class RemoteAccessTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'relay-test-secret-that-is-long-enough-0123456789';
    private const HOST = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.vibyra.test', 'remote.relay_secret' => self::SECRET, 'vibes.remote_access_live' => true]);
        Http::fake(['https://relay.vibyra.test/*' => Http::response(['ok' => true, 'disconnected' => true])]);
    }

    /** @return array{0: User, 1: string} */
    private function account(string $email, string $plan = 'pro'): array
    {
        $token = $this->postJson('/api/auth/signup', ['name' => 'Ellis', 'email' => $email, 'password' => 'secret123', 'deviceName' => 'iPhone'])
            ->assertSuccessful()->json('token');
        $user = User::where('email', $email)->firstOrFail();
        $user->forceFill(['plan' => $plan])->save();

        return [$user, $token];
    }

    private function auth(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }

    private function register(string $token, string $hostId = self::HOST, string $name = 'Ellis MacBook'): array
    {
        return $this->postJson('/api/remote/hosts', ['hostId' => $hostId, 'name' => $name, 'platform' => 'macos', 'version' => '0.1.13'],
            $this->auth($token))->assertOk()->json();
    }

    private function relay(array $events, string $secret = self::SECRET): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/remote/relay/events', ['relayId' => 'relay-1', 'events' => $events], $this->auth($secret));
    }

    public function test_a_computer_registers_and_takes_a_relay_token_the_relay_would_accept(): void
    {
        [$user, $token] = $this->account('ellis@example.com');
        $registered = $this->register($token);
        $this->assertSame('wss://relay.vibyra.test', $registered['relayUrl']);
        $claims = app(RelayTokens::class)->verify($registered['token']);
        $this->assertSame(['host', self::HOST, (string) $user->id], [$claims['role'], $claims['hostId'], $claims['userId']]);
        $this->assertGreaterThan(time() + 500, $claims['exp']);
        $this->assertMatchesRegularExpression('/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $registered['token'], 'the shape host/relay/src/tokens.mjs parses');

        $list = $this->getJson('/api/remote/hosts', $this->auth($token))->assertOk()->json();
        $this->assertTrue($list['live']);
        $this->assertSame([['id' => self::HOST, 'name' => 'Ellis MacBook', 'platform' => 'macos', 'version' => '0.1.13', 'online' => false,
            'lastSeenAt' => null, 'activeSessions' => 0]], $list['computers']);
        $this->assertSame('host.registered', RemoteAuditEvent::query()->latest('id')->firstOrFail()->event);
        $this->postJson('/api/remote/hosts', ['hostId' => 'nope', 'name' => 'x'], $this->auth($token))->assertStatus(422);
    }

    public function test_the_relay_reports_presence_and_a_phone_of_the_same_account_takes_a_grant(): void
    {
        [$user, $token] = $this->account('ellis@example.com');
        $this->register($token);
        $this->relay([['event' => 'host.online', 'hostId' => self::HOST]], 'wrong-secret-that-is-long-enough-000000000000')->assertStatus(401);
        $this->relay([['event' => 'host.online', 'hostId' => self::HOST]])->assertOk()->assertJson(['applied' => 1]);
        $this->assertTrue($this->getJson('/api/remote/hosts', $this->auth($token))->json('computers.0.online'));

        $grant = $this->postJson('/api/remote/hosts/'.self::HOST.'/connect', ['clientName' => 'Ellis iPhone'], $this->auth($token))->assertOk()->json();
        $claims = app(RelayTokens::class)->verify($grant['token']);
        $this->assertSame(['client', self::HOST, (string) $user->id], [$claims['role'], $claims['hostId'], $claims['userId']]);
        $this->assertSame('Ellis MacBook', $grant['host']['name']);
        $this->assertSame(self::HOST, $grant['host']['id']);

        $this->relay([['event' => 'session.started', 'hostId' => self::HOST, 'userId' => (string) $user->id, 'clientId' => 'c-1', 'jti' => $claims['jti']]])
            ->assertOk()->assertJson(['applied' => 1]);
        $this->assertSame(1, $this->getJson('/api/remote/hosts', $this->auth($token))->json('computers.0.activeSessions'));
        $this->relay([['event' => 'session.ended', 'hostId' => self::HOST, 'clientId' => 'c-1', 'jti' => $claims['jti']],
            ['event' => 'presence', 'hosts' => [['hostId' => self::HOST, 'userId' => (string) $user->id, 'clients' => 0]]],
            ['event' => 'host.offline', 'hostId' => self::HOST]])->assertOk()->assertJson(['applied' => 3]);
        $this->assertFalse($this->getJson('/api/remote/hosts', $this->auth($token))->json('computers.0.online'));

        $events = collect($this->getJson('/api/remote/activity', $this->auth($token))->assertOk()->json('events'));
        $this->assertSame(['host.offline', 'session.ended', 'session.started', 'host.online', 'host.registered'], $events->pluck('event')->all());
        $this->assertSame(['client' => 'Ellis iPhone', 'computer' => 'Ellis MacBook'], $events[1]['detail']);
        $this->assertStringNotContainsString('token', json_encode($events), 'no secret ever lands in the audit log');
    }

    public function test_connecting_is_refused_when_not_live_not_entitled_not_owned_or_offline(): void
    {
        [, $token] = $this->account('ellis@example.com');
        $this->register($token);
        $connect = fn () => $this->postJson('/api/remote/hosts/'.self::HOST.'/connect', [], $this->auth($token));
        $connect()->assertStatus(409)->assertJsonFragment(['error' => 'That computer is not online. Open Vibyra on it and keep it awake.']);

        $this->relay([['event' => 'host.online', 'hostId' => self::HOST]]);
        User::where('email', 'ellis@example.com')->update(['plan' => 'free']);
        $connect()->assertStatus(403)->assertJsonFragment(['error' => 'Connecting from anywhere is part of Pro. Your computer still works on the same Wi-Fi.']);
        config(['remote.require_plan' => false]);
        $connect()->assertOk();

        config(['vibes.remote_access_live' => false]);
        $connect()->assertStatus(503);
        $this->assertFalse($this->getJson('/api/remote/hosts', $this->auth($token))->json('live'));
        $this->postJson('/api/remote/hosts', ['hostId' => self::HOST, 'name' => 'Mac'], $this->auth($token))->assertStatus(503);

        config(['vibes.remote_access_live' => true]);
        [, $other] = $this->account('someone@example.com');
        $this->postJson('/api/remote/hosts/'.self::HOST.'/connect', [], $this->auth($other))->assertStatus(404);
        $this->assertSame([], $this->getJson('/api/remote/hosts', $this->auth($other))->json('computers'));
    }

    public function test_removing_a_computer_cuts_it_off_and_registering_again_brings_it_back(): void
    {
        [$user, $token] = $this->account('ellis@example.com');
        $this->register($token);
        $this->relay([['event' => 'host.online', 'hostId' => self::HOST]]);
        $this->deleteJson('/api/remote/hosts/'.self::HOST, [], $this->auth($token))->assertOk()->assertJson(['removed' => true]);
        Http::assertSent(fn ($request) => $request->url() === 'https://relay.vibyra.test/admin/disconnect'
            && $request->hasHeader('Authorization', 'Bearer '.self::SECRET) && $request['hostId'] === self::HOST);
        $this->assertSame([], $this->getJson('/api/remote/hosts', $this->auth($token))->json('computers'));
        $this->postJson('/api/remote/hosts/'.self::HOST.'/connect', [], $this->auth($token))->assertStatus(404);
        $this->relay([['event' => 'host.online', 'hostId' => self::HOST]])->assertJson(['applied' => 0]);
        $this->deleteJson('/api/remote/hosts/'.self::HOST, [], $this->auth($token))->assertOk()->assertJson(['removed' => false]);

        $this->register($token, self::HOST, 'Ellis MacBook Air');
        $this->assertSame('Ellis MacBook Air', $this->getJson('/api/remote/hosts', $this->auth($token))->json('computers.0.name'));

        // Signing in on that computer with another account moves it there.
        [, $other] = $this->account('someone@example.com');
        $this->register($other);
        $this->assertSame([], $this->getJson('/api/remote/hosts', $this->auth($token))->json('computers'));
        $this->assertSame(self::HOST, $this->getJson('/api/remote/hosts', $this->auth($other))->json('computers.0.id'));
        $this->assertSame(0, RemoteAuditEvent::query()->where('user_id', $user->id)->where('event', 'session.started')->count());
    }
}
