<?php
use App\Models\AgentV2\Connection;
use App\Models\AgentCapabilities\Installation;
use App\Services\AgentCapabilities\Catalogue;
use Illuminate\Support\Facades\DB;
final class ConcStageSixAuthority
{
    public static function run(): void
    {
        require_once __DIR__.'/../StageSixOps.php';
        ConcStageSixOps::setup(); Conc::$scenario = 'Stage6 browser CAS and capability authority';
        self::browser(); self::capabilities();
        Conc::check('authority races produce no deadlock', ConcPg::count('deadlock detected') === 0);
    }
    private static function fixture(): array
    {
        $fx = ConcFixture::make(false);
        DB::table('users')->where('id', $fx['user'])->update(['plan' => 'pro', 'membership_ends_at' => now()->addDay()]);
        return $fx;
    }
    private static function job(array $fx, string $method, string $uri, array $json): array
    {
        return ['op' => 'stage6_authority', 'method' => $method, 'uri' => $uri, 'token' => $fx['token'], 'json' => $json];
    }
    private static function browser(): void
    {
        $fx = self::fixture(); $uri = '/api/agents/v2/agents/'.$fx['agent'].'/browser';
        $state = ConcFixture::ok(ConcHttp::call('GET', $uri, $fx['token']), 200);
        $body = ['expectedRevision' => $state['revision'], 'expectedConnectionId' => null, 'expectedGeneration' => 0,
            'origins' => ['https://shop.example.com']];
        $race = ConcRace::run(array_fill(0, 8, self::job($fx, 'PUT', $uri, $body)));
        Conc::check('eight identical first browser grants retain one exact connection and revision', Conc::tally($race) === ['200' => 8]
            && Connection::where('user_id', $fx['user'])->where('provider', 'browser')->count() === 1, json_encode(Conc::tally($race)));
        $state = ConcFixture::ok(ConcHttp::call('GET', $uri, $fx['token']), 200);
        $body = ['expectedRevision' => $state['revision'], 'expectedConnectionId' => $state['browser']['connectionId'],
            'expectedGeneration' => $state['browser']['generation']];
        $race = ConcRace::run([self::job($fx, 'DELETE', $uri, $body),
            self::job($fx, 'PUT', $uri, [...$body, 'origins' => ['https://other.example.com']])]);
        Conc::check('edit versus revoke has one CAS winner and no merged authority',
            Conc::tally($race) === ['200' => 1, '409:browser_access_changed' => 1], json_encode(Conc::tally($race)));
        $latest = ConcFixture::ok(ConcHttp::call('GET', $uri, $fx['token']), 200);
        Conc::check('stale browser create cannot revive or overwrite the newer decision',
            ConcHttp::call('PUT', $uri, $fx['token'], ['expectedRevision' => 0, 'expectedConnectionId' => null,
                'expectedGeneration' => 0, 'origins' => ['https://shop.example.com']])['status'] === 409
            && ConcFixture::ok(ConcHttp::call('GET', $uri, $fx['token']), 200) === $latest);
    }
    private static function capabilities(): void
    {
        $fx = self::fixture();
        $c = Connection::create(['user_id' => $fx['user'], 'provider' => 'github', 'external_identity' => 'fixture',
            'generation' => 1, 'health' => 'healthy', 'capability_revision' => 1]);
        $row = app(Catalogue::class)->get('github', $c); $uri = '/api/agents/v2/capabilities/github/install';
        $body = ['connectionId' => $c->id, 'expectedConnectionGeneration' => 1, 'expectedRevision' => 0,
            'version' => $row['version'], 'reviewHash' => $row['reviewHash']];
        $race = ConcRace::run(array_fill(0, 8, self::job($fx, 'PUT', $uri, $body)));
        Conc::check('identical installation retries retain one reviewed revision without implicit grants',
            Conc::tally($race) === ['200' => 8] && Installation::where('connection_id', $c->id)->count() === 1
            && Installation::where('connection_id', $c->id)->value('revision') === 1
            && DB::table('agent_grants')->where('user_id', $fx['user'])->count() === 0, json_encode(Conc::tally($race)));
        $grant = '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$c->id;
        $race = ConcRace::run([self::job($fx, 'DELETE', $uri, ['connectionId' => $c->id, 'expectedRevision' => 1]),
            self::job($fx, 'PUT', $grant, ['operations' => ['github_read_issue']])]);
        $tally = Conc::tally($race);
        Conc::check('revoke versus explicit grant leaves no active grant whichever acquires the mutex first',
            in_array($tally, [['200' => 2], ['200' => 1, '409:capability_review_required' => 1]], true)
            && DB::table('agent_grants')->where('connection_id', $c->id)->whereNull('revoked_at')->count() === 0
            && Installation::where('connection_id', $c->id)->value('revoked_at') !== null, json_encode($tally));
        DB::table('agent_teammates')->where('id', $fx['agent'])->update(['integrations' => '["github"]']);
        ConcFixture::admit($fx, 'Read GitHub issues.');
        Conc::check('persistent revoked installation blocks later implicit adoption and stale install retry',
            DB::table('agent_grants')->where('connection_id', $c->id)->whereNull('revoked_at')->count() === 0
            && ConcHttp::call('PUT', $uri, $fx['token'], $body)['status'] === 409);
    }
}
