<?php
namespace App\Services\AgentBrowserWorkflows;
use App\Models\AgentBrowserWorkflows\Workflow;
use App\Models\AgentV2\{Connection, Grant, Run, RuntimeBinding};
use App\Services\AgentRuns\{ApiError, RuntimeBindings};
use App\Services\AgentRuns\Jobs\Membership;
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\{Crypt, DB};
final class Context
{
    public static function data(?string $runId): ?array
    {
        if (!$runId) return null;
        $row = DB::table('agent_browser_workflow_tests')->where('run_id', $runId)->first();
        return $row ? json_decode(Crypt::decryptString($row->context), true, 64, JSON_THROW_ON_ERROR) : null;
    }
    public static function isolated(Run $run): bool { return $run->id && (\App\Services\AgentRuns\Jobs\Contexts::mode($run) === 'browser_test' || self::data($run->id) !== null); }
    public static function profile(Run $run): ?array
    {
        $c = self::data($run->id);
        if (!$c && self::isolated($run)) ApiError::throw(409, 'browser_test_context_missing', 'This test has no verified procedure context.');
        return $c ? ['name' => 'Browser procedure test', 'brief' => Steps::instructions($c['steps']), 'memory' => '', 'skills' => []] : null;
    }
    public static function filterTools(Run $run, array $entries): array
    {
        if (!self::isolated($run)) return $entries;
        return array_values(array_filter($entries, fn ($e) => in_array($e['tool'], ['browser_open', 'browser_resolve',
            'browser_click', 'browser_type', 'browser_submit', 'browser_takeover_request'], true)));
    }
    public static function authorizeTool(Run $run, array $call): void
    {
        $c = self::data($run->id);
        if (!$c && self::isolated($run)) ApiError::throw(409, 'browser_test_context_missing', 'This test has no verified procedure context.');
        if ($c && (($call['connectionId'] ?? null) !== $c['connectionId'] || !Progress::permits($run, $call, $c)))
            ApiError::throw(409, 'browser_test_step_changed', 'Run the exact next reviewed step with its fresh resolved target.');
    }
    public static function fence(RuntimeBinding $runtime, string $runId, bool $receiptOnly = false): void
    {
        $c = self::data($runId);
        if (!$c) {
            if (self::isolated(Run::findOrFail($runId))) ApiError::throw(409, 'browser_test_context_missing', 'This test has no verified procedure context.');
            return;
        }
        if (!RuntimePins::same($c['runtime'], RuntimeBindings::snapshot($runtime))) ApiError::throw(409, 'browser_test_runtime_changed', 'Use the reviewed Mac account.');
        if ($receiptOnly) return;
        Membership::require($runtime->user_id);
        $fresh = RuntimeBinding::findOrFail($runtime->id);
        if (($fresh->capabilities['browserWorkflowsV1'] ?? false) !== true) ApiError::throw(409, 'runtime_upgrade', 'Update this Mac before continuing the browser test.');
        if (!config('agents_v2.browser_workflows_enabled')) ApiError::throw(409, 'browser_workflows_disabled', 'Browser teaching is unavailable.');
        $w = Workflow::query()->where('user_id', $runtime->user_id)->find($c['workflowId']);
        $connection = Connection::query()->where('user_id', $runtime->user_id)->find($c['connectionId']);
        $grant = Grant::query()->find($c['grant']['grantId']);
        if (!$w || $w->revision !== $c['revision'] || $w->review_hash !== $c['reviewHash'] || !$connection || $connection->revoked_at
            || $connection->generation !== $c['grant']['generation'] || !$grant || $grant->revoked_at || $grant->revision !== $c['grant']['revision'])
            ApiError::throw(409, 'browser_test_access_changed', 'The procedure or browser access changed. Review and test it again.');
    }
}
