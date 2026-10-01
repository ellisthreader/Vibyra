<?php
namespace Tests\Feature;

use App\Models\{RemoteHost, User, VibyraSession};
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use App\Services\Remote\RemoteAccessException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\RemotePasskeyFixture;
use Tests\TestCase;

class PasskeyEnrollmentRaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_second_pending_registration_cannot_skip_the_first_existing_passkey(): void
    {
        config(['remote_security.origin' => 'https://remote.test', 'remote_security.rp_id' => 'remote.test']);
        $user = User::factory()->create();
        $host = RemoteHost::create(['user_id' => $user->id, 'host_id' => str_repeat('a', 64), 'name' => 'Mac',
            'remote_access_mode' => 'ask', 'authorization_generation' => 1, 'registered_at' => now()]);
        $device = DB::table('trusted_devices')->insertGetId(['user_id' => $user->id, 'remote_host_id' => $host->id,
            'uuid' => (string) Str::uuid(), 'public_key' => str_repeat('b', 64), 'device_name' => 'Phone',
            'authorization_generation' => 1, 'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(5),
            'permissions' => '["terminal:access"]', 'approved_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $sessions = collect(['legitimate', 'other'])->map(fn ($token) => VibyraSession::create([
            'user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay()]));
        $ceremonies = app(PasskeyCeremonies::class);
        $pending = $sessions->map(function ($session) use ($ceremonies, $device) {
            $flow = $ceremonies->begin($session, $device, 'register');
            parse_str(parse_url($flow['url'], PHP_URL_FRAGMENT), $ticket);
            $row = DB::table('remote_passkey_ceremonies')->where('id', $flow['id'])->first();
            return [$flow['id'], $ticket['secret'], base64_decode($row->challenge)];
        });
        $first = new RemotePasskeyFixture();
        $second = new RemotePasskeyFixture();
        [$id, $secret, $challenge] = $pending[0];
        $ceremonies->finish($id, $secret, $first->register($challenge));
        $this->assertDatabaseCount('passkey_credentials', 1);
        [$id, $secret, $challenge] = $pending[1];
        try {
            $ceremonies->finish($id, $secret, $second->register($challenge));
            $this->fail('An older registration must prove the now-existing passkey.');
        } catch (RemoteAccessException $error) {
            $this->assertSame('strong_auth_required', $error->errorCode);
        }
        $this->assertDatabaseCount('passkey_credentials', 1);
        $this->assertNull(DB::table('remote_passkey_ceremonies')->where('id', $id)->value('verified_at'));
        $this->assertSame('failed', $ceremonies->status($sessions[1], $id)['status']);
    }
}
