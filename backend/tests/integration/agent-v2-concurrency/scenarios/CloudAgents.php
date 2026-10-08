<?php

use App\Models\{AgentV2\RuntimeBinding, User, VibyraSession};
use App\Services\AgentRuns\{Admission, Cloud\Accounts, Cloud\Policies, Cloud\Registration};
use App\Services\AgentRuns\Cloud\ComputeQuotes;
use App\Services\Membership\{Enrollment, Periods};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

require_once __DIR__.'/../CloudAgentOps.php';

final class ConcCloudAgents
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 3 cloud authority';
        ConcCloudAgentOps::configure();
        [$fx, $w, $session] = self::fixture();
        $body = self::body($session);
        $policy = app(Policies::class)->save($session, $body)['policy'];
        $jobs = [];
        foreach (range(1, 6) as $i) $jobs[] = ['op' => 'cloud_agent', 'mode' => 'http', 'method' => 'PUT',
            'uri' => '/api/agents/v2/cloud', 'token' => $fx['token'], 'json' => [...self::body($session), 'expectedRevision' => 1]];
        $race = Conc::tally(ConcRace::run($jobs));
        Conc::check('simultaneous policy updates honor revision CAS exactly once', ($race['200'] ?? 0) === 1 && ($race['409'] ?? 0) === 5, json_encode($race));
        $p = app(Policies::class)->payload($fx['user'])['policy'];
        [$run] = app(Admission::class)->admit($fx['user'], ['agentId' => $fx['agent'], 'runtimeId' => $p['runtimeId'], 'idempotencyKey' => 'cloud-race', 'prompt' => 'Summarize safely']);
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'stopped', 'lease_until' => null]);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'cloud_agent', 'mode' => 'wake', 'run' => $run->id])));
        $policy = DB::table('agent_cloud_policies')->where('user_id', $fx['user'])->first();
        Conc::check('duplicate queue/schedule wakes reserve one compute window and start once',
            ($race['200'] ?? 0) === 6 && $policy->used_starts === 1 && $policy->reserved_budget_units === 100000
            && DB::table('cloud_computer_wakes')->where('user_id', $fx['user'])->count() === 1, json_encode($race));
        $w = DB::table('cloud_workspaces')->where('id', $w->id)->first();
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'ready', 'lease_until' => now()->addMinute()]);
        $w = DB::table('cloud_workspaces')->where('id', $w->id)->first(); self::accounts($w);
        $registered = app(Registration::class)->register($w, ['generation' => $w->generation, 'runtimeId' => $p['runtimeId'],
            'provider' => 'claude', 'accountId' => 'cloud', 'model' => 'sonnet', 'effort' => 'high']);
        $claim = ['op' => 'cloud_agent', 'mode' => 'http', 'method' => 'POST', 'uri' => '/api/agents/v2/runner/'.$p['runtimeId'].'/claim',
            'headers' => ['X-Vibyra-Runner-Key' => $registered['runnerKey']]];
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, $claim)));
        Conc::check('six cloud claims admit one fenced run generation', ($race['200'] ?? 0) === 1 && ($race['204'] ?? 0) === 5
            && $run->fresh()->lease_generation === 1, json_encode($race));
        app(Policies::class)->revoke($fx['user'], $p['revision']);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, $claim)));
        Conc::check('every stale runner is refused after policy revocation', ($race['404:runtime_not_found'] ?? 0) === 6, json_encode($race));
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'stopped', 'lease_until' => null]);
        app(\App\Services\AgentRuns\Cloud\WakePending::class)->run($run->id);
        Conc::check('revocation cannot spend another wake allocation', DB::table('agent_cloud_policies')->where('user_id', $fx['user'])->value('used_starts') === 1);
    }

    public static function fixture(string $accountId = 'cloud'): array
    {
        $fx = ConcFixture::make(false);
        $u = User::findOrFail($fx['user']); $u->forceFill(['email_verified_at' => now()])->save();
        app(Enrollment::class)->migrate($u, (int) $u->credits_balance);
        app(Periods::class)->grant($u->id, ['reference' => 'cloud:conc', 'provider' => 'stripe', 'environment' => 'test',
            'subscription_id' => 'sub', 'payment_id' => 'pay', 'offer_key' => 'pro_monthly', 'starts_at' => now(),
            'ends_at' => now()->addMonth(), 'units' => 3000000, 'paid_minor' => 1999, 'currency' => 'GBP']);
        DB::table('vibyra_sessions')->where('user_id', $u->id)->update(['absolute_expires_at' => now()->addDay(), 'idle_expires_at' => now()->addDay()]);
        $session = VibyraSession::where('user_id', $u->id)->first();
        DB::table('cloud_connect_consents')->insert(['user_id' => $u->id, 'version' => config('cloud_workspaces.connect_consent_version'),
            'source' => 'phone', 'accepted_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $id = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $id, 'user_id' => $u->id, 'name' => 'Cloud test', 'project_id' => 'cloud-computer',
            'app_name' => 'test-'.Str::random(8), 'kind' => 'computer', 'state' => 'ready', 'generation' => 1, 'region' => config('cloud_workspaces.region'),
            'terms_accepted_at' => now(), 'lease_until' => now()->addMinute(), 'deadline_at' => now()->addHour(), 'created_at' => now(), 'updated_at' => now()]);
        $w = DB::table('cloud_workspaces')->where('id', $id)->first(); self::accounts($w, $accountId);
        return [$fx, $w, $session];
    }
    public static function accounts(object $w, string $accountId = 'cloud'): void
    {
        app(Accounts::class)->report($w, [['provider' => 'claude', 'accountId' => $accountId, 'label' => 'Test', 'authenticated' => true, 'models' => ['sonnet'], 'efforts' => ['high']]]);
    }
    public static function body(VibyraSession $s, string $accountId = 'cloud'): array
    {
        $q = app(ComputeQuotes::class)->create($s, ['profile' => 'standard', 'deviceId' => 'conc-device', 'budgetUnits' => 100000, 'deadlineSeconds' => 600]);
        return ['quoteId' => $q['id'], 'deviceId' => 'conc-device', 'provider' => 'claude', 'accountId' => $accountId, 'model' => 'sonnet', 'effort' => 'high',
            'expectedRevision' => 0, 'maxStarts' => 1, 'totalBudgetUnits' => 100000, 'totalSeconds' => 600, 'expiresAt' => now()->addHour()->toIso8601String()];
    }
}
