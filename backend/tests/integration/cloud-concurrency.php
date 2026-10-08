<?php
// This runner exclusively owns the temporary local cluster used for cloud QA.
require __DIR__.'/../../vendor/autoload.php';
$pdo = new PDO('pgsql:host=127.0.0.1;port=56387;dbname=postgres', getenv('USER'), '');
if ($pdo->query("SELECT current_setting('data_directory')")->fetchColumn() !== '/private/tmp/vibyra-cloud-pgqa') throw new Exception('Dedicated temporary QA cluster required');
$database = 'vibyra_cloud_qa_'.bin2hex(random_bytes(4));
$pdo->exec('CREATE DATABASE '.$database);
$parentPid=getmypid();
register_shutdown_function(function () use ($pdo,$database,$parentPid) {
    if (getmypid() !== $parentPid) return;
    try {DB::disconnect(); $pdo->exec('DROP DATABASE '.$database.' WITH (FORCE)');} catch (Throwable) {}
});
$app = require __DIR__.'/../../bootstrap/app.php'; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\User;
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\{Wallet, Turns};
use App\Services\CloudWorkspaces\{Reservations, Workspaces};
use Illuminate\Support\Facades\{Artisan, DB};
use Illuminate\Support\Str;
config(['database.default' => 'pgsql', 'database.connections.pgsql.host' => '127.0.0.1', 'database.connections.pgsql.port' => 56387,
    'database.connections.pgsql.database' => $database, 'database.connections.pgsql.username' => getenv('USER'), 'database.connections.pgsql.password' => '',
    'cache.default' => 'database', 'queue.default' => 'database', 'vibes.queue_connection' => 'database',
    'membership.free_enabled' => false, 'vibes.enabled' => true, 'vibes.daily_micro_usd_limit' => 100000000,
    'cloud_workspaces.enabled' => true, 'cloud_workspaces.daily_micro_limit' => 100000000]);
DB::purge('pgsql'); Artisan::call('migrate', ['--force' => true]);
function check($ok, $message) { if (!$ok) throw new Exception($message); echo "PASS $message\n"; }
function race(array $jobs): array {
    DB::disconnect(); $paths = []; $children = []; $start = microtime(true) + .2;
    foreach ($jobs as $job) { $path = tempnam(sys_get_temp_dir(), 'cloud-race-'); $paths[] = $path; $pid = pcntl_fork();
        if ($pid === 0) { DB::purge(); while (microtime(true) < $start) usleep(1000);
            try { $job(); $result = ['ok' => true]; } catch (Throwable $e) { $result = ['ok' => false, 'error' => $e->getMessage()]; }
            file_put_contents($path, json_encode($result)); exit(0);
        } $children[] = $pid;
    }
    foreach ($children as $pid) pcntl_waitpid($pid, $status); DB::purge(); $results = [];
    foreach ($paths as $path) { $results[] = json_decode(file_get_contents($path), true); unlink($path); } return $results;
}
$u = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]); app(Wallet::class)->ensure($u, 0); app(Enrollment::class)->migrate($u, 0);
$reference = 'cloud-qa:'.Str::uuid(); app(Periods::class)->grant($u->id, ['reference' => $reference, 'provider' => 'stripe', 'environment' => 'test',
    'subscription_id' => 'qa_'.Str::uuid(), 'payment_id' => 'qa', 'offer_key' => 'pro_monthly', 'starts_at' => now(), 'ends_at' => now()->addMonth(), 'units' => 80000, 'paid_minor' => 1999, 'currency' => 'GBP']);
DB::table('vibes_wallets')->where('user_id', $u->id)->update(['consented_at' => now()]);
$id = (string) Str::uuid(); DB::table('cloud_workspaces')->insert(['id' => $id, 'user_id' => $u->id, 'name' => 'Race QA', 'project_id' => 'qa',
    'app_name' => 'qa-'.str_replace('-', '', $id), 'state' => 'ready', 'generation' => 1, 'budget_units' => 1000000, 'created_at' => now(), 'updated_at' => now()]);
$w = app(Workspaces::class)->owned($u->id, $id); $chat = (string) Str::uuid();
DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $u->id, 'title' => 'AI race', 'created_at' => now(), 'updated_at' => now()]);
$quote = ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'test', 'text' => 'QA', 'request' => [], 'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => false, 'max' => 50000];
$results = race([fn () => app(Turns::class)->submit($u->id, (string) Str::uuid(), $quote), fn () => DB::transaction(function () use ($u, $w) {
    app(Wallet::class)->lock($u->id); app(Reservations::class)->reserve($w, 50000);
})]);
check(count(array_filter($results, fn ($r) => $r['ok'])) === 1 && app(Wallet::class)->available($u->id) === 30000, 'racing AI and runtime cannot overspend shared paid grants');
$r = DB::table('cloud_reservations')->where('workspace_id', $id)->first(); $turn = DB::table('vibes_turns')->where('chat_id', $chat)->first();
$settle = function () use ($u, $r, $turn) { if ($r) DB::transaction(function () use ($u, $r) { app(Wallet::class)->lock($u->id); app(Reservations::class)->settle($r, 123, 100); });
    else app(Turns::class)->settle($turn->id, 123, 'Done'); };
$results = race(array_fill(0, 4, $settle));
check(count(array_filter($results, fn ($r) => $r['ok'])) === 4 && app(Wallet::class)->available($u->id) === 79877, 'four simultaneous settlements debit once and release unused units exactly');
$results = race([fn () => app(Periods::class)->refund($reference, 1999), fn () => DB::transaction(function () use ($u, $w) {
    app(Wallet::class)->lock($u->id); app(\App\Services\CloudWorkspaces\Eligibility::class)->authorize($u->id); app(Reservations::class)->reserve($w, 50000);
})]);
$pending = DB::table('cloud_reservations')->where('workspace_id', $id)->whereNull('settled_at')->first();
if ($pending) { DB::transaction(function () use ($u, $pending) { app(Wallet::class)->lock($u->id); app(Reservations::class)->settle($pending, 0, 0); }); app(Periods::class)->refund($reference, 1999); }
check(app(Wallet::class)->available($u->id) === 0 && (int) DB::table('membership_periods')->where('reference', $reference)->value('refunded_minor') === 1999, 'racing refund and runtime either settle the hold first or refuse new spend');
// Included-hours allowance (not yet run against Postgres): four racing windows of 400s against 1000s never over-draw it,
// and a replayed window returns its first answer.
config(['vibes.plans.pro_v2.cloudHours' => 1000 / 3600]);
$allowance = app(\App\Services\CloudWorkspaces\Allowance::class); $w = app(Workspaces::class)->owned($u->id, $id);
$results = race(array_map(fn ($k) => fn () => $allowance->consume($w, 400, 'race-'.$k), range(1, 4)));
check(count(array_filter($results, fn ($r) => $r['ok'])) === 4 && (int) DB::table('cloud_allowance_usage')->where('user_id', $u->id)->where('kind', 'consume')->sum('seconds') === 1000
    && $allowance->remainingSeconds($u->id) === 0 && $allowance->consume($w, 400, 'race-1') === (int) DB::table('cloud_allowance_usage')->where('idempotency_key', 'consume:'.$id.':1:race-1')->value('seconds'),
    'racing allowance windows serialise on the wallet lock and never draw more than the monthly hours');

// Versioned profiles, trial time and byte grants use the same real Postgres locks.
config(['vibes.plans.pro_v2.cloudHours'=>0,'cloud_preview.enabled'=>true,'cloud_preview.trial_enabled'=>true,'cloud_preview.economics_verified'=>true,
    'cloud_preview.egress_micro_per_gib'=>20000,'cloud_preview.startup_exposure_micro'=>20000,
    'cloud_preview.economics'=>['net_micro_per_offer'=>['pro_monthly'=>13993000,'pro_annual'=>139993000,'tokens_80'=>3493000,'tokens_200'=>6993000,'tokens_450'=>13993000], 'usd_per_gbp'=>1.2,'vat_fraction'=>.2,'fee_fraction'=>.3,'fixed_micro_month'=>3200000,'ai_micro_per_token'=>10000,'reviewed_at'=>now()->toDateTimeString()],
    'cloud_preview.profiles.standard.provider_micro_per_hour'=>130000,
    'cloud_workspaces.lease_private_key'=>base64_encode(sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair())),
    'cloud_workspaces.starts_enabled'=>true,'cloud_workspaces.provider_audit_required'=>false,'cloud_workspaces.tariff_version'=>'qa',
    'cloud_workspaces.units_per_hour'=>250000,'cloud_workspaces.provider_micro_per_hour'=>130000,'cloud_workspaces.fly_token'=>'qa','cloud_workspaces.fly_org'=>'qa',
    'cloud_workspaces.api_origin'=>'https://qa.example.test','cloud_workspaces.image'=>'registry.test/image@sha256:'.str_repeat('a',64)]);
$u=User::factory()->create(['email_verified_at'=>now(),'credits_balance'=>0]); app(Wallet::class)->ensure($u,0);app(Enrollment::class)->migrate($u,0);
app(Periods::class)->grant($u->id,['reference'=>'qa:'.Str::uuid(),'provider'=>'stripe','environment'=>'test','subscription_id'=>'qa2','payment_id'=>'qa2',
    'offer_key'=>'pro_monthly','starts_at'=>now(),'ends_at'=>now()->addMonth(),'units'=>80000,'paid_minor'=>1999,'currency'=>'GBP']);
$session=App\Models\VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256',Str::random()),'device_name'=>'QA','idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addMonth()]);
DB::table('cloud_connect_consents')->insert(['user_id'=>$u->id,'version'=>config('cloud_workspaces.connect_consent_version'),'source'=>'phone','accepted_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
$id=(string)Str::uuid();DB::table('cloud_workspaces')->insert(['id'=>$id,'user_id'=>$u->id,'kind'=>'computer','name'=>'Quote race','project_id'=>'qa',
    'app_name'=>'qa-'.str_replace('-','',$id),'state'=>'stopped','generation'=>0,'budget_units'=>1000000,'created_at'=>now(),'updated_at'=>now()]);
$q=app(App\Services\CloudComputer\ComputeQuotes::class)->create($session,['profile'=>'standard','deviceId'=>'qa-phone','budgetUnits'=>10000]);
$d=['quoteId'=>$q['id'],'deviceId'=>'qa-phone','requestId'=>(string)Str::uuid(),'acceptTerms'=>true];
$results=race(array_fill(0,4,fn()=>app(App\Services\CloudComputer\Wake::class)->wake($session,$d)));
if (count(array_filter($results,fn($r)=>$r['ok'])) !== 4) throw new Exception(json_encode($results));
check(count(array_filter($results,fn($r)=>$r['ok']))===4 && DB::table('cloud_reservations')->where('workspace_id',$id)->count()===1
    && DB::table('cloud_workspaces')->where('id',$id)->value('generation')===1,'racing identical quote acceptances produce one generation and one paid hold');
DB::table('cloud_preview_trials')->insert(['user_id'=>$u->id,'state'=>'verified','used_seconds'=>0,'confirmed_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
$w=app(Workspaces::class)->owned($u->id,$id);
$results=race(array_fill(0,4,fn()=>DB::transaction(function () use($w) {app(Wallet::class)->lock($w->user_id);app(App\Services\CloudComputer\PreviewTrial::class)->consume($w,200);} )));
check(count(array_filter($results,fn($r)=>$r['ok']))===4 && DB::table('cloud_preview_trials')->where('user_id',$u->id)->value('used_seconds')===600,
    'four trial consumers cannot exceed the 600-second physical-device trial');
config(['cloud_preview.global_egress_bytes_day'=>3145728,'cloud_preview.account_egress_bytes_day'=>3145728]);
$jobs=[];
for($i=0;$i<4;$i++) {
    $owner=User::factory()->create(['email_verified_at'=>now()]);app(Wallet::class)->ensure($owner,0);
    $wid=(string)Str::uuid();DB::table('cloud_workspaces')->insert(['id'=>$wid,'user_id'=>$owner->id,'kind'=>'computer','name'=>'Egress race','project_id'=>'qa',
        'app_name'=>'qa-'.str_replace('-','',$wid),'state'=>'ready','compute_profile'=>'standard','generation'=>1,'created_at'=>now(),'updated_at'=>now()]);
    $nw=app(Workspaces::class)->owned($owner->id,$wid);
    $jobs[]=fn()=>DB::transaction(function () use($nw) {app(Wallet::class)->lock($nw->user_id);app(App\Services\CloudComputer\PreviewEgress::class)->record($nw,0);});
}
$results=race($jobs);
check(count(array_filter($results,fn($r)=>$r['ok']))===4 && (int)DB::table('cloud_egress_days')->sum('held')===3145728
    && (int)DB::table('cloud_egress_days')->sum('bytes')===0,'four VMs reserve byte windows without overshooting the shared global bandwidth cap');
