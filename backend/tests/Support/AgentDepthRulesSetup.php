<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Http;

/** The GitHub and Gmail accounts, grants and helpers every standing-rule test starts from (Part 16). Used with AgentV2Fixture, AgentV2Routes and AgentDepthFixture. */
trait AgentDepthRulesSetup
{
    protected const ISSUES = '#api\.github\.com/repos/qa-org/sandbox/issues$#';
    protected string $github;
    protected string $gmail;

    protected function setUpRules(): void
    {
        $this->bootV2();
        $this->depth(['rules']);
        $this->github = $this->providerInstall('github', '@owner', 'gh-token');
        $this->gmail = $this->gmailInstall('owner@example.com');
        $this->grant($this->github, ['github_create_issue', 'github_comment_issue']);
        $this->grant($this->gmail, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->route('POST', self::ISSUES, Http::response(['id' => 1200, 'number' => 12, 'title' => 'Sync', 'html_url' => 'https://github.com/qa-org/sandbox/issues/12'], 201));
    }

    protected function rule(array $body)
    {
        $data = ['tool' => 'github_create_issue', 'connectionId' => $this->github, 'effect' => 'allow', 'scope' => 'qa-org/sandbox', ...$body];
        $current = \App\Models\AgentV2\ApprovalRule::query()->where('user_id', $this->user->id)->where('agent_id', $this->agent['id'])
            ->where('tool', $data['tool'])->where('connection_id', $data['connectionId'])->whereNull('revoked_at')
            ->where('scope', \App\Services\AgentRuns\Rules\RuleEligibility::normalize($data['scope'], $data['tool']))->first();
        return $this->postJson('/api/agents/v2/agents/'.$this->agent['id'].'/rules', ['expectedRevision' => $current?->revision ?? 0, ...$data]);
    }

    protected function issue(array $claimed, string $callId, string $repo = 'qa-org/sandbox', string $body = 'Agenda.')
    {
        return $this->callTool($claimed, 'github_create_issue', $this->github, ['repository' => $repo, 'title' => 'Sync', 'body' => $body], $callId)->assertOk();
    }
}
