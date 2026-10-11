<?php
use App\Models\AgentV2\{BrowserFile, RuntimeBinding, ToolAction};
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;
final class ConcBrowserFiles
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage6 browser files';
        $s = self::stage(); $job = self::job($s, 'first');
        $race = ConcRace::run(array_fill(0, 8, $job));
        Conc::check('parallel identical receipts create exactly one encrypted artifact', Conc::tally($race) === ['200' => 8]
            && BrowserFile::where('action_id', $s['action']['id'])->count() === 1, json_encode(Conc::tally($race)));
        $s = self::stage();
        $race = ConcRace::run([self::job($s, 'one'), self::job($s, 'two')]);
        Conc::check('conflicting bytes race retains one exact file and refuses the other', Conc::tally($race) === ['200' => 1, '409:browser_file_conflict' => 1]
            && BrowserFile::where('action_id', $s['action']['id'])->count() === 1, json_encode(Conc::tally($race)));
        $s = self::stage();
        $seed = self::job($s, 'seed'); ConcFixture::ok(ConcHttp::runner($s['fx'], 'POST', $seed['suffix'], $seed['json']), 200);
        BrowserFile::where('action_id', $s['action']['id'])->update(['size' => \App\Services\AgentBrowser\Files::QUOTA - 3]);
        $jobs = [];
        for ($i = 0; $i < 2; $i++) {
            $copy = ToolAction::findOrFail($s['action']['id'])->replicate();
            $copy->id = (string) \Illuminate\Support\Str::uuid(); $copy->call_id = 'quota-'.$i;
            $copy->save(); $copyState = $s; $copyState['action']['id'] = $copy->id;
            $jobs[] = self::job($copyState, 'abc');
        }
        $race = ConcRace::run($jobs);
        Conc::check('two simultaneous files cannot cross account quota', Conc::tally($race) === ['200' => 1, '422' => 1]
            && (int) BrowserFile::where('user_id', $s['fx']['user'])->sum('size') === \App\Services\AgentBrowser\Files::QUOTA,
            json_encode(Conc::tally($race)));
        $s = self::stage();
        $cancel = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$s['run']['id'].'/cancel', 'token' => $s['fx']['token']];
        $race = ConcRace::run([$cancel, self::job($s, 'late factual file')]);
        Conc::check('cancel versus an already claimed download retains factual bytes without reviving task', Conc::tally($race) === ['200' => 2]
            && DB::table('agent_runs')->where('id', $s['run']['id'])->value('state') === 'cancelled'
            && BrowserFile::where('action_id', $s['action']['id'])->count() === 1, json_encode(Conc::tally($race)));
        Conc::check('browser artifact races produced no deadlock', ConcPg::count('deadlock detected') === 0);
    }
    private static function stage(): array
    {
        $fx = ConcFixture::make(false);
        DB::table('users')->where('id', $fx['user'])->update(['plan' => 'pro', 'membership_ends_at' => now()->addDay()]);
        $binding = RuntimeBinding::findOrFail($fx['runtime']['id']);
        $binding->forceFill(['capabilities' => [...$binding->capabilities, 'browserTools' => true, 'browserWorkflowsV1' => true]])->save();
        $route = '/api/agents/v2/agents/'.$fx['agent'].'/browser';
        $state = ConcFixture::ok(ConcHttp::call('GET', $route, $fx['token']), 200);
        $grant = ConcFixture::ok(ConcHttp::call('PUT', $route, $fx['token'], ['origins' => ['https://shop.example.com'],
            'expectedRevision' => $state['revision'], 'expectedConnectionId' => null, 'expectedGeneration' => 0]), 200)['browser'];
        ConcFixture::admit($fx, 'Download a synthetic file.'); $run = ConcFixture::claim($fx);
        $action = ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$run['id'].'/tools', ['generation' => $run['generation'],
            'callId' => 'download', 'tool' => 'browser_download', 'connectionId' => $grant['connectionId'],
            'schemaRevision' => app(ToolCatalog::class)->schemaRevision('browser_download'),
            'arguments' => ['url' => 'https://shop.example.com/invoice']]), 200)['action'];
        $fp = ToolAction::findOrFail($action['id'])->fingerprint;
        ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$run['id'].'/browser/'.$action['id'].'/claim',
            ['generation' => $run['generation'], 'fingerprint' => $fp]), 200);
        return compact('fx', 'run', 'action');
    }
    private static function job(array $s, string $bytes): array
    {
        return ['op' => 'runner', 'fx' => $s['fx'], 'method' => 'POST', 'suffix' => '/runs/'.$s['run']['id'].'/browser/files',
            'json' => ['generation' => $s['run']['generation'], 'actionId' => $s['action']['id'], 'name' => 'fixture.txt',
                'mimeType' => 'text/plain', 'sha256' => hash('sha256', $bytes), 'contentBase64' => base64_encode($bytes)]];
    }
}
