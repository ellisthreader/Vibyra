<?php
// Disposable loopback fixture only. No production credential or database inputs.
declare(strict_types=1);
[$script, $mode, $backendInput, $directoryInput, $portInput] = array_pad($argv, 5, null);
function stopFixture(string $message): never { fwrite(STDERR, $message."\n"); exit(1); }
if (! in_array($mode, ['init', 'revoke', 'serve', 'authenticate'], true) || ! $backendInput || ! $directoryInput) {
    stopFixture('Usage: php api-integration-fixture.php init|revoke|serve|authenticate DISPOSABLE_BACKEND TEMP_DIRECTORY [PORT=8948]');
}
$tempRoot = realpath(sys_get_temp_dir());
$backend = realpath($backendInput);
// macOS /private/tmp is distinct from its per-user sys_get_temp_dir().
$allowedRoots = array_filter([$tempRoot, realpath('/private/tmp'), realpath('/tmp')]);
$underTemp = static fn (string $path): bool => (bool) array_filter($allowedRoots, static fn ($root) => str_starts_with($path, $root.'/'));
if (! $backend || ! $underTemp($backend) || ! is_file($backend.'/bootstrap/app.php')) stopFixture('Backend must be an explicit disposable checkout under a system temp directory.');
if (is_file($backend.'/bootstrap/cache/config.php')) stopFixture('Refusing a backend with cached configuration.');
$created = false;
if (! file_exists($directoryInput)) {
    $parent = realpath(dirname($directoryInput));
    if (! $parent || ! $underTemp($parent.'/'.basename($directoryInput))) stopFixture('Fixture directory must be under system temp.');
    if ($mode !== 'init' || ! mkdir($directoryInput, 0700)) stopFixture('Create a new fixture with init first.');
    $created = true;
}
$directory = realpath($directoryInput);
if (! $directory || is_link($directoryInput) || ! $underTemp($directory) || $directory === $backend) stopFixture('Invalid disposable directory.');
if (! function_exists('posix_geteuid') || fileowner($directory) !== posix_geteuid() || (fileperms($directory) & 0777) !== 0700) stopFixture('Fixture directory must be owned by this user with mode 0700.');
$marker = $directory.'/.vibyra-relay-fixture';
if ($created) { file_put_contents($marker, bin2hex(random_bytes(32))); chmod($marker, 0600); }
if (is_link($marker) || ! is_file($marker) || ! preg_match('/^[a-f0-9]{64}$/', trim((string) file_get_contents($marker)))) stopFixture('Missing disposable-fixture ownership marker.');
$secret = trim(file_get_contents($marker));
$port = filter_var($portInput ?? '8948', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1024, 'max_range' => 65535]]);
if ($port === false) stopFixture('Invalid loopback port.');
$db = $directory.'/integration.sqlite';
if (is_link($db)) stopFixture('Database symlinks are forbidden.');
if (! file_exists($db)) { touch($db); chmod($db, 0600); }
if (realpath($db) !== $db || fileowner($db) !== posix_geteuid()) stopFixture('Database must resolve inside the owned disposable directory.');
$env = [
    'APP_ENV' => 'testing', 'APP_KEY' => 'base64:'.base64_encode(hash('sha256', $secret, true)),
    'APP_CONFIG_CACHE' => $directory.'/never-cache-config.php', 'DB_CONNECTION' => 'sqlite',
    'DB_DATABASE' => $db, 'DB_URL' => '', 'DATABASE_URL' => '', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array',
    'VIBYRA_RELAY_URL' => 'wss://relay.test', 'VIBYRA_RELAY_SECRET' => $secret,
    'VIBYRA_RELAY_SIGNING_SECRET' => $secret, 'VIBYRA_RELAY_REPORT_SECRET' => $secret, 'VIBYRA_RELAY_ADMIN_SECRET' => $secret,
    'VIBYRA_REMOTE_REQUIRE_PLAN' => 'false', 'VIBES_REMOTE_ACCESS_LIVE' => 'true',
    'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync', 'VIBYRA_SECURITY_EMAIL_NOTIFICATIONS' => 'false',
    'VIBYRA_PASSKEY_ORIGIN' => 'http://localhost:'.$port, 'VIBYRA_PASSKEY_RP_ID' => 'localhost',
];
if (file_exists($env['APP_CONFIG_CACHE'])) stopFixture('Refusing cached fixture configuration.');
foreach ($env as $key => $value) { putenv($key.'='.$value); $_ENV[$key] = $_SERVER[$key] = $value; }
require $backend.'/vendor/autoload.php';
$app = require $backend.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || $app->configurationIsCached()
    || config('database.default') !== 'sqlite'
    || Illuminate\Support\Facades\DB::connection()->getDriverName() !== 'sqlite'
    || realpath(Illuminate\Support\Facades\DB::connection()->getDatabaseName()) !== $db) stopFixture('Resolved application/database is not the disposable testing SQLite fixture.');
if ($mode === 'serve') {
    chdir($backend);
    $router = $directory.'/router.php';
    $public = var_export($backend.'/public', true);
    file_put_contents($router, '<?php $root = '.$public.'; $path = realpath($root.parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH)); if ($path && str_starts_with($path, $root."/") && is_file($path)) return false; require $root."/index.php";');
    chmod($router, 0600);
    passthru(escapeshellarg(PHP_BINARY).' -S '.escapeshellarg('127.0.0.1:'.$port).' -t public '.escapeshellarg($router), $status);
    exit($status);
}
config(['remote.relay_url' => 'wss://relay.test', 'remote.relay_secret' => $secret,
    'remote.relay_report_secret' => $secret, 'remote.relay_admin_secret' => $secret,
    'remote.require_plan' => false, 'vibes.remote_access_live' => true]);
if ($mode === 'authenticate') {
    $session = App\Models\VibyraSession::firstOrFail();
    $device = App\Models\TrustedDevice::where('user_id', $session->user_id)->firstOrFail();
    $ceremony = app(App\Services\Remote\Passkeys\PasskeyCeremonies::class)->begin($session, $device->id, 'authenticate');
    $output = $directory.'/fixture.json';
    if (is_link($output) || ! is_file($output)) stopFixture('Fixture output unavailable.');
    $data = json_decode(file_get_contents($output), true, flags: JSON_THROW_ON_ERROR);
    $data['passkeyUrl'] = $ceremony['url'];
    file_put_contents($output, json_encode($data, JSON_THROW_ON_ERROR)); chmod($output, 0600); exit;
}
if ($mode === 'revoke') {
    Illuminate\Support\Facades\Http::fake(fn () => Illuminate\Support\Facades\Http::response([], 503));
    $host = App\Models\RemoteHost::firstOrFail();
    app(App\Services\Remote\RemoteAccess::class)->revoke($host->user, $host->host_id); exit;
}
Illuminate\Support\Facades\Artisan::call('migrate:fresh', ['--force' => true]);
$user = App\Models\User::factory()->create();
$session = App\Models\VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', random_bytes(32)),
    'device_name' => 'integration', 'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
$keys = sodium_crypto_box_keypair(); $hostId = bin2hex(sodium_crypto_box_publickey($keys));
$challenge = app(App\Services\Remote\RemoteIdentityProof::class)->challenge($user, $session->id, $hostId, 'register');
$proof = base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $keys));
$host = app(App\Services\Remote\RemoteAccess::class)->register($user, $hostId, 'Integration', null, null, $session->id, $challenge['challengeId'], $proof);
App\Models\RemoteHost::where('host_id', $hostId)->update(['online_until' => now()->addHour(), 'remote_access_mode' => 'trusted']);
$model = App\Models\RemoteHost::where('host_id', $hostId)->firstOrFail();
$deviceKeys = sodium_crypto_box_keypair();
$device = App\Models\TrustedDevice::create(['user_id' => $user->id, 'remote_host_id' => $model->id,
    'uuid' => (string) Illuminate\Support\Str::uuid(), 'authorization_generation' => $model->authorization_generation,
    'public_key' => bin2hex(sodium_crypto_box_publickey($deviceKeys)), 'device_name' => 'Integration phone',
    'permissions' => ['screen:view'], 'approved_at' => now(), 'pairing_code' => '123456', 'request_expires_at' => now()->addMinutes(5)]);
$ceremony = app(App\Services\Remote\Passkeys\PasskeyCeremonies::class)->begin($session, $device->id, 'register');
// This fixture isolates relay interoperability. Real WebAuthn is separately
// tested with signed ES256 assertions and the browser's virtual authenticator.
$keyId = Illuminate\Support\Facades\DB::table('passkey_credentials')->insertGetId(['user_id' => $user->id,
    'credential_hash' => hash('sha256', random_bytes(32)), 'credential_id' => App\Services\Remote\Passkeys\WebAuthnVerifier::encode(random_bytes(32)), 'public_key' => 'fixture',
    'counter' => 0, 'device_name' => 'Fixture', 'created_at' => now(), 'updated_at' => now()]);
Illuminate\Support\Facades\DB::table('remote_strong_auth')->insert(['app_session_id' => $session->id,
    'trusted_device_id' => $device->id, 'passkey_credential_id' => $keyId, 'verified_at' => now(), 'expires_at' => now()->addMinutes(5)]);
$challenge = app(App\Services\Remote\RemoteDeviceProof::class)->challenge($session, $device->uuid, 'connect', ['screen:view']);
$client = app(App\Services\Remote\RemoteAccess::class)->connect($user, $hostId, 'Integration phone', $session->id,
    ['deviceId' => $device->uuid, 'challengeId' => $challenge['challengeId'], 'permissions' => ['screen:view'],
        'proof' => base64_encode(sodium_crypto_box_seal_open(base64_decode($challenge['ciphertext']), $deviceKeys))]);
$output = $directory.'/fixture.json';
if (is_link($output)) stopFixture('Fixture output symlinks forbidden.');
file_put_contents($output, json_encode(['hostId' => $hostId, 'userId' => (string) $user->id, 'generation' => 1,
    'authorizationContext' => $host['authorizationContext'], 'authorizationKey' => $host['authorizationKey'], 'passkeyUrl' => $ceremony['url'], 'hostToken' => $host['token'], 'clientToken' => $client['token'], 'reportSecret' => $secret,
    'apiUrl' => 'http://127.0.0.1:'.$port, 'backend' => $backend, 'directory' => $directory, 'port' => $port], JSON_THROW_ON_ERROR));
chmod($output, 0600);
