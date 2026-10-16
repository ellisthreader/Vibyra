<?php
// Seeds the throwaway e2e database: a verified Pro user, a phone session, a trusted-device-capable passkey. Prints JSON.
use App\Models\{User, VibyraSession};
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{DB, Hash};
use Illuminate\Support\Str;

$user = User::create(['name' => 'E2E Cloud', 'email' => 'e2e-cloud@example.invalid', 'password' => Hash::make(Str::random(32)),
    'email_verified_at' => now(), 'credits_balance' => 0]);
app(Wallet::class)->ensure($user, 0); app(Enrollment::class)->migrate($user, 0);
app(Periods::class)->grant($user->id, ['reference' => 'e2e:pro', 'provider' => 'stripe', 'environment' => 'test', 'subscription_id' => 'sub', 'payment_id' => 'pay',
    'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
DB::table('cloud_connect_consents')->insert(['user_id' => $user->id, 'version' => app(\App\Services\CloudComputer\ConnectConsent::class)->current(), 'source' => 'phone', 'accepted_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
$token = getenv('E2E_PHONE_TOKEN') ?: bin2hex(random_bytes(24)); // the Fly E2E passes its own long random token
$session = VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'e2e phone',
    'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
$credential = (string) Str::uuid();
DB::table('passkey_credentials')->insert(['user_id' => $user->id, 'credential_hash' => hash('sha256', $credential), 'credential_id' => $credential,
    'public_key' => 'fixture-only', 'counter' => 1, 'device_name' => 'e2e phone', 'created_at' => now(), 'updated_at' => now()]);
echo json_encode(['userId' => $user->id, 'sessionId' => $session->id, 'token' => $token]), "\n";
