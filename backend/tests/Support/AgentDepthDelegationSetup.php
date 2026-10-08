<?php

namespace Tests\Support;

/** The accounts, teammates and first claim every delegation test starts from (Part 16). Used with AgentV2Fixture, AgentV2Routes and AgentDepthFixture. */
trait AgentDepthDelegationSetup
{
    protected string $gmail;
    protected string $github;
    protected array $calendar;
    protected array $claimed;
    protected array $parent;

    protected function setUpDelegation(): void
    {
        $this->bootV2();
        $this->depth(['delegation']);
        $this->gmail = $this->gmailInstall('owner@example.com');
        $this->github = $this->providerInstall('github', '@owner', 'gh-token');
        $this->grant($this->gmail, ['gmail_read', 'gmail_search']);
        $this->calendar = $this->teammate('Calendar', [$this->github => ['github_list_repositories', 'github_create_issue']]);
    }

    protected function start(): void
    {
        $this->parent = $this->admit('Plan the launch and check the repos.');
        $this->claimed = $this->claim();
    }
}
