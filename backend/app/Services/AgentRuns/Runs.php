<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Receipt;
use App\Models\AgentV2\Run;
use App\Models\AgentV2\ToolAction;
use Illuminate\Support\Facades\DB;

/** Client-side reads and cancellation of account-owned runs. */
final class Runs
{
    public function __construct(private readonly Lifecycle $lifecycle, private readonly Events $events) {}

    public function find(int $userId, string $id): Run
    {
        $run = Run::query()->where('user_id', $userId)->whereKey($id)->first();
        if (!$run) ApiError::throw(404, 'run_not_found', 'That task does not exist.');
        return $run;
    }

    /** @return Run[] newest first */
    public function list(int $userId, string $agentId, int $limit): array
    {
        return Run::query()->where('user_id', $userId)->where('agent_id', $agentId)
            ->orderByDesc('conversation_seq')->limit(max(1, min(50, $limit)))->get()->all();
    }

    /** Account/teammate-scoped keyset page; new admissions cannot move an older page. */
    public function page(int $userId, string $agentId, int $limit, ?string $cursor = null): array
    {
        $limit = max(1, min(50, $limit));
        $query = Run::query()->where('user_id', $userId)->where('agent_id', $agentId);
        if ($cursor !== null) {
            $anchor = (clone $query)->whereKey($cursor)->first();
            if (!$anchor) ApiError::throw(422, 'invalid_cursor', 'That history page is unavailable. Refresh the task list.');
            $query->where(fn ($q) => $q->where('conversation_seq', '<', $anchor->conversation_seq)
                ->orWhere(fn ($q) => $q->where('conversation_seq', $anchor->conversation_seq)->where('id', '<', $anchor->id)));
        }
        $rows = $query->orderByDesc('conversation_seq')->orderByDesc('id')->limit($limit + 1)->get();
        $more = $rows->count() > $limit;
        $page = $rows->take($limit)->all();
        return ['runs' => $page, 'nextCursor' => $more ? end($page)->id : null];
    }

    /** Fences further model/tool dispatch. Late receipts from in-flight calls are kept. */
    public function cancel(int $userId, string $id): Run
    {
        return DB::transaction(function () use ($userId, $id) {
            $run = Run::query()->where('user_id', $userId)->whereKey($id)->lockForUpdate()->first();
            if (!$run) ApiError::throw(404, 'run_not_found', 'That task does not exist.');
            if (RunStates::terminal($run->state)) return $run;
            $run->forceFill(['cancel_requested_at' => now()])->save();
            ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['pending_approval', 'approved'])
                ->update(['state' => 'cancelled', 'summary' => 'Task cancelled', 'updated_at' => now()]);
            $this->lifecycle->move($run, RunStates::CANCELLED, 'cancelled_by_user');
            return $run;
        });
    }

    /** A cheap validator for conditional GETs: changes whenever the journal or state does. */
    public static function etag(Run $run, string $suffix = ''): string
    {
        return '"'.substr(hash('sha256', $run->id.':'.$run->event_seq.':'.$run->state.':'.$suffix.':'.app(Outputs\Outputs::class)->revisionTag($run)), 0, 32).'"';
    }

    public function payload(Run $run): array
    {
        $actions = ToolAction::query()->where('run_id', $run->id)->orderBy('created_at')->orderBy('id')->get();
        $receipts = Receipt::query()->where('run_id', $run->id)->get()->keyBy('action_id');
        $connections = \App\Models\AgentV2\Connection::query()->where('user_id', $run->user_id)
            ->whereIn('id', $actions->pluck('connection_id')->unique()->values())->get(['id', 'provider', 'external_identity'])->keyBy('id');
        $snap = $run->runtime_snapshot ?? [];
        return [...Steering::payload($run), 'id' => $run->id, 'agentId' => $run->agent_id, 'conversationId' => $run->conversation_id,
            'conversationSeq' => $run->conversation_seq, 'idempotencyKey' => $run->idempotency_key, 'state' => $run->state, 'stateReason' => $run->state_reason,
            'terminal' => RunStates::terminal($run->state), 'prompt' => $run->prompt,
            'attachments' => $run->attachments ?? [], 'answer' => $run->answer,
            'outputs' => app(Outputs\Outputs::class)->forRun($run),
            'fundingSource' => $run->funding_source,
            'runtime' => ['id' => $snap['bindingId'] ?? null, 'executionTarget' => $snap['executionTarget'] ?? 'local',
                'cloudWorkspaceId' => $snap['cloudWorkspaceId'] ?? null, 'accountId' => $snap['accountRef'] ?? null, 'bindingId' => $snap['bindingId'] ?? null, 'hostId' => $snap['hostId'] ?? null,
                'provider' => $snap['provider'] ?? null, 'accountRef' => $snap['accountRef'] ?? null,
                'model' => $snap['model'] ?? null, 'effort' => $snap['effort'] ?? null],
            'profileRevision' => $run->profile_revision, 'eventCursor' => $run->event_seq,
            'cancelRequested' => $run->cancel_requested_at !== null, 'resumeAfter' => $run->resume_after?->toIso8601String(),
            'actions' => $actions->map(fn (ToolAction $a) => $this->action($a, $receipts->get($a->id), $connections->get($a->connection_id)))->all(),
            'createdAt' => $run->created_at?->toIso8601String(), 'startedAt' => $run->started_at?->toIso8601String(),
            'finishedAt' => $run->finished_at?->toIso8601String()];
    }

    /** `provider`/`account` come from the call's own connection (tool-name fallback), so clients never guess. */
    private function action(ToolAction $a, ?Receipt $r, ?\App\Models\AgentV2\Connection $c = null): array
    {
        return ['id' => $a->id, 'callId' => $a->call_id, 'tool' => $a->tool, 'kind' => $a->kind,
            'provider' => $c?->provider ?? app(Tools\ToolProviders::class)->of($a->tool), 'account' => $c?->external_identity,
            'connectionId' => $a->connection_id, 'state' => $a->state, 'summary' => $a->summary,
            'arguments' => $a->kind === 'write' ? (object) (Guard\SecretGuard::enabled()
                ? Guard\SecretGuard::redactValue($a->arguments ?? []) : ($a->arguments ?? [])) : null,
            'containsSecret' => !empty($a->secret_kinds), 'secretKinds' => $a->secret_kinds ?? [],
            'fingerprint' => $a->state === 'pending_approval' ? $a->fingerprint : null,
            'expiresAt' => $a->state === 'pending_approval' ? $a->expires_at?->toIso8601String() : null,
            'receipt' => $r ? ['status' => $r->status, 'outcome' => $r->outcome,
                'providerResourceId' => $r->provider_resource_id, 'url' => $r->provider_url, 'summary' => $r->summary] : null];
    }

    /** What a runner receives on claim: the immutable task plus prior turns for continuity. */
    public function claimPayload(Run $run, array $manifest): array
    {
        $agent = DB::table('agent_teammates')->where('id', $run->agent_id)->first();
        $history = Run::query()->where('agent_id', $run->agent_id)->where('user_id', $run->user_id)
            ->where('state', RunStates::COMPLETED)->where('conversation_seq', '<', $run->conversation_seq)
            ->orderByDesc('conversation_seq')->limit(10)->get(['id', 'prompt', 'answer'])->reverse()->values()
            ->map(fn (Run $r) => ['runId' => $r->id, 'prompt' => $r->prompt, 'answer' => $r->answer])->all();
        $history = app(Memory\Recall::class)->history($run, $history);
        $notes = app(Planning\RunNotes::class)->for($run, $agent);
        return [...Steering::payload($run), 'id' => $run->id, 'agentId' => $run->agent_id, 'conversationId' => $run->conversation_id,
            'generation' => $run->lease_generation, 'leaseExpiresAt' => $run->lease_expires_at?->toIso8601String(),
            'state' => $run->state, 'prompt' => $run->prompt, 'attachments' => $run->attachments ?? [],
            'runtime' => $run->runtime_snapshot, 'eventCursor' => $run->event_seq,
            'profile' => ['name' => $agent?->name, 'brief' => Planning\RunNotes::brief($agent?->brief, $notes['text']),
                'memory' => app(Memory\Recall::class)->text($run, $agent?->memory), 'revision' => $run->profile_revision],
            'actionCheckpoint' => Steering::actions($run), 'history' => $history, 'tools' => $manifest, 'connectionGaps' => $notes['gaps']];
    }
}
