<?php

namespace App\Services\AgentRuns\Planning;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Grants, RuntimeBindings};
use App\Services\AgentRuns\Tools\{Manifest, Relevance};
use App\Services\AgentRuns\Tools\Providers\Adapters;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The task plan card: what a run admitted from this exact body would be able to
 * use, before anything is admitted. Same grant snapshot, AI-account selection and
 * task-relevant manifest as admission, but nothing is stored, no model is called
 * and nothing is spent. Missing connections/grants come with a fix.
 */
final class TaskPlan
{
    public function __construct(private readonly Grants $grants, private readonly RuntimeBindings $bindings,
        private readonly Manifest $manifest, private readonly Relevance $relevance, private readonly Adapters $adapters,
        private readonly PlanGaps $gaps) {}

    public function preview(int $userId, array $data): array
    {
        $agent = $this->grants->agent($userId, $data['agentId']);
        [$binding, $runtimeIssue] = $this->binding($userId, $data['runtimeId'] ?? null);
        $run = new Run(['user_id' => $userId, 'agent_id' => $agent->id, 'prompt' => $data['prompt'],
            'idempotency_key' => $data['idempotencyKey'] ?? null, 'attachments' => $data['attachments'] ?? [],
            'grant_snapshot' => $this->grants->snapshot($userId, $agent->id),
            'runtime_snapshot' => $binding ? RuntimeBindings::snapshot($binding) : [],
            'conversation_seq' => (int) Run::query()->where('agent_id', $agent->id)->max('conversation_seq') + 1]);
        $selection = $this->manifest->selection($run);
        $services = $this->services($selection);
        $mentioned = $this->relevance->mentionedProviders($run);
        $missing = $this->gaps->find($userId, $agent, $run, $mentioned, $services, $selection['dropped']);
        $runtime = $binding ? [...$this->bindings->payload($binding), 'ok' => true] : ['ok' => false, ...$runtimeIssue];
        return ['agentId' => $agent->id, 'fundingSource' => 'connected_account', 'runtime' => $runtime,
            'services' => array_values($services),
            'tools' => array_map(fn ($t) => $this->brief($t), $selection['tools']),
            'approvals' => array_values(array_map(fn ($t) => $this->brief($t),
                array_filter($selection['tools'], fn ($t) => $t['requiresApproval']))),
            'dropped' => array_map(fn ($t) => $this->brief($t), $selection['dropped']),
            'mentioned' => $mentioned, 'missing' => $missing,
            'ready' => $binding !== null && !array_filter($missing, fn ($m) => $m['blocking']),
            'maxTools' => (int) config('agents_v2.max_tools', 10)];
    }

    /** @return array{0: ?\App\Models\AgentV2\RuntimeBinding, 1: array} the binding, or the refusal admission would give */
    private function binding(int $userId, ?string $runtimeId): array
    {
        try {
            return [$this->bindings->select($userId, $runtimeId), []];
        } catch (HttpResponseException $e) {
            $body = $e->getResponse()->getData(true);
            return [null, ['code' => $body['code'] ?? 'runtime_required', 'message' => $body['error'] ?? '',
                'fix' => $body['fix'] ?? null]];
        }
    }

    /** Selected tools grouped by account, in manifest order. */
    private function services(array $selection): array
    {
        $services = [];
        foreach ($selection['tools'] as $tool) {
            $id = $tool['connectionId'];
            $services[$id] ??= ['provider' => $tool['provider'], 'name' => $this->adapters->name($tool['provider']),
                'connectionId' => $id, 'account' => $tool['account'], 'score' => (int) ($selection['scores'][$id] ?? 0),
                'reads' => [], 'writes' => []];
            $services[$id][$tool['kind'] === 'write' ? 'writes' : 'reads'][] = $tool['tool'];
        }
        return $services;
    }

    private function brief(array $t): array
    {
        return ['tool' => $t['tool'], 'provider' => $t['provider'], 'connectionId' => $t['connectionId'],
            'account' => $t['account'], 'kind' => $t['kind'], 'requiresApproval' => $t['requiresApproval']];
    }
}
