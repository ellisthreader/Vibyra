<?php
namespace Tests\Support;

trait AgentWorkProposalFixture
{
    private function skillSpec(): array { return ['name' => 'Clear updates', 'instructions' => 'Summarize evidence in plain English.', 'assignToAgent' => true]; }

    private function goalSpec(): array
    {
        return ['title' => 'Prepare release', 'expiresAt' => now()->addDays(5)->toIso8601String(), 'milestones' => [
            ['key' => 'review', 'title' => 'Review changes', 'prompt' => 'Summarize the saved changes.',
                'successCriteria' => 'A clear summary is delivered.', 'dependsOn' => []]]];
    }

    private function draft(string $kind = 'skill', ?array $spec = null): array
    {
        $this->admit('Prepare a reviewed work suggestion.'); $run = $this->claim();
        $id = $this->callTool($run, 'propose_work', $run['id'], ['kind' => $kind, 'spec' => $spec ?? $this->skillSpec()], 'draft-1')
            ->assertOk()->assertJsonPath('action.result.active', false)->json('action.result.proposalId');
        return [$run, $this->getJson('/api/agents/v2/proposals/'.$id)->assertOk()->json('proposal')];
    }

    private function acceptProposal(array $p)
    {
        return $this->postJson('/api/agents/v2/proposals/'.$p['id'].'/accept', ['revision' => $p['revision'], 'reviewHash' => $p['reviewHash']]);
    }
}
