<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Tools\Executor;
use App\Services\ChatConnectors\Github\WriteTools;

/**
 * The approved draft PR: the existing exact PR writer (head/base refs pinned to the
 * last confirmed publish, confirmed field by field, never re-sent) with the GitHub
 * account pinned in the approval.
 */
final class ComputerPullRequest
{
    public function __construct(private readonly Executor $executor, private readonly Credentials $credentials,
        private readonly WriteTools $writer) {}

    public function execute(ToolAction $action): ToolAction
    {
        $args = $action->arguments;
        $github = ComputerBinding::githubCurrent($args['github'] ?? []);
        if (!$github) return $this->executor->finish($action, 'failed', 'failed', 'refused',
            ['error' => 'The GitHub account changed before the pull request was opened.', 'outcome' => 'refused'], 'Pull request not opened');
        unset($args['github']);
        try {
            $out = $this->writer->run('github_create_pull_request', $args, $this->credentials->for($github));
        } catch (\Throwable) {
            $out = ['result' => ['error' => 'GitHub did not confirm the pull request. Inspect the repository before any retry.'],
                'summary' => 'Pull request outcome unconfirmed'];
        }
        $result = $out['result'];
        if (($result['opened'] ?? false) === true)
            return $this->executor->finish($action, 'completed', 'confirmed', 'confirmed', $result, $out['summary'],
                ['resourceId' => $args['repository'].'#'.$result['number'], 'url' => $result['url'] ?? null]);
        $unknown = isset($result['error']);
        return $this->executor->finish($action, $unknown ? 'unknown' : 'failed', $unknown ? 'unknown' : 'failed',
            $unknown ? 'outcome_unknown' : 'refused', [...$result, 'error' => $result['error'] ?? $result['reason'] ?? 'Not opened.'],
            $out['summary'], ['url' => $result['url'] ?? null]);
    }
}
