<?php

use Illuminate\Support\Facades\DB;

/** Revision CAS and dispatch races use real Postgres locks, with provider I/O faked in every worker. */
final class ConcDraftOutputs
{
    private const ARGS = ['to' => 'board@example.com', 'subject' => 'Original', 'body' => 'Original draft'];

    public static function run(): void
    {
        Conc::$scenario = 'drafts and outputs';
        self::draftEdits();
        self::draftVersusSend();
        self::outputEdits();
        self::quota();
    }

    private static function pending(): array
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Prepare a draft.');
        $run = ConcFixture::claim($fx);
        return [$fx, $run, ConcFixture::write($fx, $run, self::ARGS, 'send')];
    }

    private static function edit(array $fx, array $a, string $body): array
    {
        return ['op' => 'call', 'method' => 'PATCH', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/draft',
            'token' => $fx['token'], 'json' => ['revision' => 1, 'fingerprint' => $a['fingerprint'],
                'arguments' => [...self::ARGS, 'body' => $body]]];
    }

    private static function draftEdits(): void
    {
        [$fx, , $a] = self::pending();
        $race = ConcRace::run(array_map(fn ($n) => self::edit($fx, $a, 'Revision '.$n), range(1, 6)));
        $tally = Conc::tally($race);
        $row = DB::table('agent_tool_actions')->find($a['id']);
        Conc::check('six edits of one draft revision: one wins, five stale; two immutable revisions, no send',
            ($tally['200'] ?? 0) === 1 && ($tally['409:stale_draft'] ?? 0) === 5 && $row->draft_revision === 2
            && DB::table('agent_draft_revisions')->where('action_id', $a['id'])->count() === 2
            && ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 0, json_encode($tally));
    }

    private static function draftVersusSend(): void
    {
        $bad = [];
        for ($i = 0; $i < 8; $i++) {
            [$fx, , $a] = self::pending();
            $edit = self::edit($fx, $a, 'Edited but not yet approved');
            $approve = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/decision',
                'token' => $fx['token'], 'json' => ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']];
            $race = ConcRace::run([$edit, $approve]);
            $row = DB::table('agent_tool_actions')->find($a['id']);
            $sends = ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']);
            $codes = Conc::tally($race);
            $edited = $row->draft_revision === 2 && $row->state === 'pending_approval' && $sends === 0
                && ($codes['409:stale_fingerprint'] ?? 0) === 1;
            $sent = $row->draft_revision === 1 && $row->state === 'completed' && $sends === 1
                && ($codes['409:draft_closed'] ?? 0) === 1;
            if (!$edited && !$sent) $bad[] = [$codes, $row->state, $row->draft_revision, $sends];
        }
        Conc::check('edit versus send (8 races): edited draft never uses old approval; already claimed send cannot change', !$bad, json_encode($bad));
    }

    private static function outputFixture(): array
    {
        $fx = ConcFixture::make(false);
        ConcFixture::admit($fx, 'Save a text output.');
        $run = ConcFixture::claim($fx);
        $body = self::saveBody($run, 'first');
        $response = ConcHttp::runner($fx, 'POST', '/runs/'.$run['id'].'/tools', $body);
        $output = ConcFixture::ok($response, 200)['action']['result']['output'];
        return [$fx, $run, $output];
    }

    private static function saveBody(array $run, string $call): array
    {
        return ['generation' => $run['generation'], 'callId' => $call, 'tool' => 'save_output', 'connectionId' => $run['id'],
            'schemaRevision' => \App\Services\AgentRuns\Outputs\OutputTools::revision('save_output'),
            'arguments' => ['kind' => 'text', 'title' => 'Saved output', 'content' => ['text' => 'Task result']]];
    }

    private static function outputEdits(): void
    {
        [$fx, , $output] = self::outputFixture();
        $jobs = array_map(fn ($n) => ['op' => 'call', 'method' => 'PATCH', 'uri' => '/api/agents/v2/outputs/'.$output['id'],
            'token' => $fx['token'], 'json' => ['revision' => 1, 'title' => 'Edit '.$n, 'content' => ['text' => 'Revision '.$n]]], range(1, 6));
        $tally = Conc::tally(ConcRace::run($jobs));
        Conc::check('six output edits preserve one winning revision and reject stale edits', ($tally['200'] ?? 0) === 1
            && ($tally['409:stale_output'] ?? 0) === 5 && DB::table('agent_output_revisions')->where('output_id', $output['id'])->count() === 2,
            json_encode($tally));
    }

    private static function quota(): void
    {
        [$fx, $run, ] = self::outputFixture();
        DB::table('agent_output_quotas')->where('agent_id', $fx['agent'])->update(['count' => 99]);
        // Synthetic second leased task bypasses conversation admission solely to race separate run locks against one quota.
        $copy = (array) DB::table('agent_runs')->find($run['id']);
        $copy['id'] = (string) \Illuminate\Support\Str::uuid();
        $copy['idempotency_key'] = 'quota-second';
        $copy['conversation_seq']++;
        DB::table('agent_runs')->insert($copy);
        $other = [...$run, 'id' => $copy['id']];
        $jobs = array_map(fn ($r) => ['op' => 'call', 'method' => 'POST',
            'uri' => '/api/agents/v2/runner/'.$fx['runtime']['id'].'/runs/'.$r['id'].'/tools', 'token' => $fx['token'],
            'headers' => ['X-Vibyra-Runner-Key' => $fx['runtime']['runnerKey']], 'json' => self::saveBody($r, 'quota-save')], [$run, $other]);
        $tally = Conc::tally(ConcRace::run($jobs));
        Conc::check('separate task locks cannot exceed the teammate output quota', ($tally['200'] ?? 0) === 1
            && ($tally['422'] ?? 0) === 1 && DB::table('agent_output_quotas')->where('agent_id', $fx['agent'])->value('count') === 100,
            json_encode($tally));
    }
}
