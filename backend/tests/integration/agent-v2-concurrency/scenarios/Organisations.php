<?php
use App\Models\{OrganizationMember, User};
use App\Services\AgentOrganizations\{Definitions, Instances, Maintenance, Policies};
use App\Services\Teams\Organizations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class ConcOrganisations
{
    public static function run(): void
    {
        require_once __DIR__.'/../OrganisationOps.php'; ConcOrganisationOps::setup();
        Conc::$scenario = 'Stage7 organisation authority';
        self::adoptionAndLimits(); self::offboarding(); self::publication(); self::policyEffects();
        Conc::check('organisation races have no deadlocks', ConcPg::count('deadlock detected') === 0);
    }
    private static function fixture(): array
    {
        $owner = ConcFixture::make(false); $member = ConcFixture::make(false);
        $org = app(Organizations::class)->create(User::findOrFail($owner['user']), 'Concurrency studio');
        $seat = OrganizationMember::forceCreate(['organization_id' => $org->id, 'user_id' => $member['user'], 'role' => 'admin']);
        Policies::save($owner['user'], ['expectedRevision' => 0, 'enabled' => true, 'allowedProviders' => ['gmail'], 'dailyTaskLimit' => 2, 'retentionDays' => 7]);
        $d = Definitions::save($owner['user'], (string) Str::uuid(), ['expectedRevision' => 0, 'name' => 'Research',
            'avatar' => 'assistant', 'instructions' => 'Shared process', 'knowledge' => 'Shared knowledge']);
        return compact('owner', 'member', 'org', 'seat', 'd');
    }
    private static function job(array $fx, string $method, string $uri, array $json = []): array
    {
        return ['op' => 'organisation', 'method' => $method, 'uri' => $uri, 'token' => $fx['token'], 'json' => $json];
    }
    private static function adoptionAndLimits(): void
    {
        ['owner' => $owner, 'member' => $member, 'd' => $d] = self::fixture();
        $uri = '/api/agents/v2/organisation/definitions/'.$d['id'].'/use';
        $body = ['expectedRevision' => 1, 'reviewHash' => $d['reviewHash']];
        $race = ConcRace::run(array_fill(0, 8, self::job($member, 'POST', $uri, $body)));
        $ids = array_unique(array_map(fn ($r) => $r['result']['json']['agentId'] ?? null, $race));
        Conc::check('eight identical adoption retries create exactly one private teammate', Conc::tally($race) === ['200' => 8] && count($ids) === 1, json_encode(Conc::tally($race)));
        $member['agent'] = $ids[0]; $jobs = [];
        foreach (range(1, 8) as $n) $jobs[] = self::job($member, 'POST', '/api/agents/v2/runs', ['agentId' => $member['agent'],
            'runtimeId' => $member['runtime']['id'], 'prompt' => 'Private request', 'idempotencyKey' => 'daily-limit-'.$n]);
        $race = ConcRace::run($jobs);
        Conc::check('daily task quota admits exactly two simultaneous requests', Conc::tally($race) === ['201' => 2, '429:organisation_daily_limit' => 6], json_encode(Conc::tally($race)));
        Conc::check('organisation adoption grants no connector or other member access', DB::table('agent_grants')->where('agent_id', $member['agent'])->count() === 0
            && ConcHttp::call('GET', '/api/agents/v2/runs/'.DB::table('agent_runs')->where('agent_id', $member['agent'])->value('id'), $owner['token'])['status'] === 404);
    }
    private static function offboarding(): void
    {
        ['owner' => $owner, 'member' => $member, 'd' => $d, 'seat' => $seat, 'org' => $org] = self::fixture();
        $member['agent'] = Instances::adopt($member['user'], $d['id'], 1, $d['reviewHash'])['agentId'];
        $jobs = [self::job($member, 'POST', '/api/agents/v2/runs', ['agentId' => $member['agent'],
            'runtimeId' => $member['runtime']['id'], 'prompt' => 'Race offboard', 'idempotencyKey' => 'offboard-admit']),
            ['op' => 'organisation', 'mode' => 'remove', 'owner' => $owner['user'], 'seat' => $seat->id]];
        $race = ConcRace::run($jobs); $tally = Conc::tally($race);
        Conc::check('offboard and admission serialize at the existing team seat', in_array($tally,
            [['200' => 1, '201' => 1], ['200' => 1, '409:organisation_membership_changed' => 1]], true), json_encode($tally));
        Maintenance::stopRevoked();
        Conc::check('no admitted task remains active after offboarding', DB::table('agent_runs')->where('agent_id', $member['agent'])->where('state', '!=', 'cancelled')->count() === 0);
        OrganizationMember::forceCreate(['organization_id' => $org->id, 'user_id' => $member['user'], 'role' => 'member']);
        Conc::check('rejoining creates another private instance and never revives old authority',
            Instances::adopt($member['user'], $d['id'], 1, $d['reviewHash'])['agentId'] !== $member['agent']);
    }
    private static function publication(): void
    {
        ['owner' => $owner, 'member' => $member, 'd' => $d, 'seat' => $seat] = self::fixture();
        $uri = '/api/agents/v2/organisation/definitions/'.$d['id'];
        $body = ['expectedRevision' => 1, 'name' => 'Revision two', 'avatar' => 'assistant', 'instructions' => 'Reviewed instructions', 'knowledge' => 'Reviewed knowledge'];
        $race = ConcRace::run(array_fill(0, 6, self::job($member, 'PUT', $uri, $body)));
        Conc::check('publication retries retain one immutable revision', Conc::tally($race) === ['200' => 6]
            && DB::table('agent_organisation_versions')->where('definition_id', $d['id'])->count() === 2, json_encode(Conc::tally($race)));
        $race = ConcRace::run([self::job($member, 'PUT', $uri, [...$body, 'expectedRevision' => 2, 'name' => 'Revision three']),
            ['op' => 'organisation', 'mode' => 'downgrade', 'owner' => $owner['user'], 'seat' => $seat->id]]);
        $tally = Conc::tally($race);
        Conc::check('manager downgrade and publication serialize without stale-role writes', in_array($tally,
            [['200' => 2], ['200' => 1, '403:organisation_role_required' => 1]], true), json_encode($tally));
        Conc::check('downgraded manager cannot make a later publication', ConcHttp::call('PUT', $uri, $member['token'],
            [...$body, 'expectedRevision' => 3])['status'] === 403);
    }
    private static function policyEffects(): void
    {
        ['owner' => $owner, 'member' => $member, 'd' => $d] = self::fixture();
        $member['agent'] = Instances::adopt($member['user'], $d['id'], 1, $d['reviewHash'])['agentId'];
        $member['gmail'] = ConcFixture::gmailInstall($member['user']);
        ConcFixture::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$member['agent'].'/grants/'.$member['gmail'], $member['token'], ['operations' => ['gmail_send']]), 200);
        ConcFixture::admit($member, 'Send reviewed message'); $run = ConcFixture::claim($member);
        $action = ConcFixture::write($member, $run, ['to' => 'fixture@example.invalid', 'subject' => 'Test', 'body' => 'Fixture only'], 'org-write');
        $race = ConcRace::run([self::job($owner, 'PUT', '/api/agents/v2/organisation/policy', ['expectedRevision' => 1,
            'enabled' => true, 'allowedProviders' => [], 'dailyTaskLimit' => 2, 'retentionDays' => 7]),
            self::job($member, 'POST', '/api/agents/v2/actions/'.$action['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $action['fingerprint']])]);
        $state = DB::table('agent_tool_actions')->where('id', $action['id'])->value('state');
        Conc::check('policy narrowing and exact approval have one serialized effect outcome', Conc::tally($race) === ['200' => 2]
            && in_array($state, ['completed', 'refused'], true), json_encode(Conc::tally($race)).' '.$state);
        Conc::check('provider sends equal confirmed admitted effects and never replay', ConcFakes::count('GMAIL_SEND', 'tok-'.$member['user']) === ($state === 'completed' ? 1 : 0));
    }
}
