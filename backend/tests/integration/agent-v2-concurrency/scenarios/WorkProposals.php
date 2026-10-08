<?php

use App\Models\AgentV2\WorkProposal;
use App\Services\AgentWork\Proposals\{ProposalTool, Proposals};
use Illuminate\Support\Facades\DB;

final class ConcWorkProposals
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 4 reviewed proposals';
        $fx = ConcFixture::make(false); ConcFixture::admit($fx, 'Prepare a skill draft.'); $run = ConcFixture::claim($fx);
        $spec = ['name' => 'Evidence', 'instructions' => 'Cite actual saved receipts.', 'assignToAgent' => false];
        $job = ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$run['id'].'/tools', 'json' => [
            'generation' => $run['generation'], 'callId' => 'one-proposal', 'tool' => ProposalTool::NAME,
            'connectionId' => $run['id'], 'schemaRevision' => ProposalTool::revision(), 'arguments' => ['kind' => 'skill', 'spec' => $spec]]];
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, $job)));
        $row = WorkProposal::where('run_id', $run['id'])->first();
        Conc::check('six retried model calls commit one inert draft', ($race['200'] ?? 0) === 6 && $row
            && WorkProposal::where('run_id', $run['id'])->count() === 1 && DB::table('agent_skills')->where('user_id', $fx['user'])->count() === 0, json_encode($race));
        if (!$row) return;
        $p = app(Proposals::class)->payload($row);
        $accept = self::request($fx, $p, 'accept', ['revision' => $p['revision'], 'reviewHash' => $p['reviewHash']]);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, $accept)));
        Conc::check('six accepted response retries create exactly one skill', ($race['200'] ?? 0) === 6
            && DB::table('agent_skills')->where('user_id', $fx['user'])->count() === 1 && $row->fresh()->status === 'accepted', json_encode($race));
        $p = self::draft($fx, $run, $spec, 'edit-race');
        $edited = [...$spec, 'instructions' => 'New instructions require a new review.'];
        $race = Conc::tally(ConcRace::run([self::request($fx, $p, '', ['revision' => 1, 'spec' => $edited], 'PATCH'),
            self::request($fx, $p, 'accept', ['revision' => 1, 'reviewHash' => $p['reviewHash']])]));
        $after = WorkProposal::findOrFail($p['id']);
        $valid = ($race['200'] ?? 0) === 1 && ($race['409:proposal_changed'] ?? 0) === 1;
        if ($after->status === 'accepted') $valid = $valid && DB::table('agent_skills')->where('id', $after->activation['id'])->value('instructions') === $spec['instructions'];
        else $valid = $valid && $after->status === 'draft' && $after->spec['instructions'] === $edited['instructions'];
        Conc::check('edit racing accept cannot activate an unseen instruction version', $valid, json_encode($race));
        $p = self::draft($fx, $run, $spec, 'discard-race');
        $before = DB::table('agent_skills')->where('user_id', $fx['user'])->count();
        $race = Conc::tally(ConcRace::run([self::request($fx, $p, 'discard', ['revision' => 1]),
            self::request($fx, $p, 'accept', ['revision' => 1, 'reviewHash' => $p['reviewHash']])]));
        $after = WorkProposal::findOrFail($p['id']);
        Conc::check('discard racing accept has one final decision and no duplicate activation', ($race['200'] ?? 0) === 1
            && ($race['409:proposal_changed'] ?? 0) === 1
            && DB::table('agent_skills')->where('user_id', $fx['user'])->count() === $before + ($after->status === 'accepted' ? 1 : 0), json_encode($race));
    }

    private static function draft(array $fx, array $run, array $spec, string $call): array
    {
        $response = ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$run['id'].'/tools', [
            'generation' => $run['generation'], 'callId' => $call, 'tool' => ProposalTool::NAME, 'connectionId' => $run['id'],
            'schemaRevision' => ProposalTool::revision(), 'arguments' => ['kind' => 'skill', 'spec' => $spec]]), 200);
        return app(Proposals::class)->payload(WorkProposal::findOrFail($response['action']['result']['proposalId']));
    }

    private static function request(array $fx, array $p, string $action, array $json, string $method = 'POST'): array
    {
        return ['op' => 'call', 'method' => $method, 'token' => $fx['token'],
            'uri' => '/api/agents/v2/proposals/'.$p['id'].($action ? '/'.$action : ''), 'json' => $json];
    }
}
