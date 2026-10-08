<?php

namespace App\Services\AgentRuns\Drafts;

use App\Models\AgentV2\{Connection, Run, ToolAction};
use App\Services\AgentRuns\{ApiError, Canonical, Events, RunStates, Steering};
use App\Services\AgentRuns\Tools\{Approvals, Manifest, ToolCatalog, ToolRefused};
use Illuminate\Support\Facades\DB;

/** A draft is an exact pending Gmail action, never a second send queue. */
final class Drafts
{
    public function find(int $userId, string $id): ToolAction
    {
        $a = ToolAction::query()->whereKey($id)->where('user_id', $userId)->where('tool', 'gmail_send')->first();
        if (!$a) ApiError::throw(404, 'draft_not_found', 'That draft does not exist.');
        return $a;
    }

    public function edit(int $userId, string $id, array $data): ToolAction
    {
        return DB::transaction(function () use ($userId, $id, $data) {
            $initial = $this->find($userId, $id);
            $run = Run::query()->whereKey($initial->run_id)->where('user_id', $userId)->lockForUpdate()->firstOrFail();
            $a = ToolAction::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            if ($a->state !== 'pending_approval' || $a->dispatched_at || RunStates::terminal($run->state)
                || $run->cancel_requested_at || Steering::pending($run))
                ApiError::throw(409, 'draft_closed', 'This draft can no longer be edited.');
            if ($a->expires_at?->isPast()) ApiError::throw(409, 'approval_expired', 'Prepare a new draft; this approval expired.');
            if ((int) $a->draft_revision !== $data['revision'] || !hash_equals((string) $a->fingerprint, $data['fingerprint']))
                ApiError::throw(409, 'stale_draft', 'This draft changed. Refresh before editing or sending.');
            try { [$grant, $connection] = app(Manifest::class)->authorize($run, $a->tool, $a->connection_id); }
            catch (ToolRefused $e) { ApiError::throw(409, 'draft_access_changed', $e->getMessage()); }
            if ($grant->revision !== $a->grant_revision || $connection->generation !== $a->connection_generation)
                ApiError::throw(409, 'draft_access_changed', 'Account access changed. Prepare a new draft.');
            if ($a->schema_revision !== app(ToolCatalog::class)->schemaRevision('gmail_send'))
                ApiError::throw(409, 'draft_schema_changed', 'Email sending changed. Prepare a new draft.');
            $target = $data['connectionId'] ?? $a->connection_id;
            try { [$selectedGrant, $selectedConnection] = app(DraftSenders::class)->authorize($run, $target); }
            catch (ToolRefused $e) { ApiError::throw(409, 'draft_access_changed', $e->getMessage()); }
            $args = app(ToolCatalog::class)->validate('gmail_send', $data['arguments']);
            if (array_key_exists('attachmentIds', $data)) $args['attachments'] = app(DraftAttachments::class)->resolve($userId, $data['attachmentIds']);
            elseif (array_key_exists('attachments', $a->arguments ?? [])) $args['attachments'] = $a->arguments['attachments'];
            if (Canonical::hash($args) === Canonical::hash($a->arguments) && $target === $a->connection_id) return $a;
            abort_unless((int) $a->draft_revision < 200, 422, 'This draft has reached its revision limit.');
            $this->saveRevision($a);
            $a->forceFill(['arguments' => $args, 'draft_revision' => (int) $a->draft_revision + 1,
                'draft_original_connection_id' => $a->draft_original_connection_id ?? $a->connection_id,
                'connection_id' => $selectedConnection->id, 'connection_generation' => $selectedConnection->generation,
                'grant_id' => $selectedGrant->id, 'grant_revision' => $selectedGrant->revision,
                'secret_kinds' => \App\Services\AgentRuns\Guard\SecretGuard::enabled()
                    ? (\App\Services\AgentRuns\Guard\SecretGuard::kindsIn($args) ?: null) : null])->save();
            // args_hash remains the original model call hash: its retry replays this action, never recreates the old draft.
            $a->forceFill(['fingerprint' => Approvals::fingerprint($a, $userId)])->save();
            $this->saveRevision($a);
            app(Events::class)->append($run, 'draft.revised', ['actionId' => $id, 'revision' => (int) $a->draft_revision]);
            return $a;
        });
    }

    public function payload(ToolAction $a): array
    {
        $run = Run::query()->whereKey($a->run_id)->firstOrFail();
        return ['id' => $a->id, 'runId' => $a->run_id, 'agentId' => Run::query()->whereKey($a->run_id)->value('agent_id'),
            'revision' => (int) $a->draft_revision, 'state' => $a->state, 'arguments' => \App\Services\AgentRuns\Guard\SecretGuard::enabled()
                ? \App\Services\AgentRuns\Guard\SecretGuard::redactValue($a->arguments) : $a->arguments,
            'containsSecret' => !empty($a->secret_kinds), 'secretKinds' => $a->secret_kinds ?? [],
            'account' => Connection::query()->whereKey($a->connection_id)->where('user_id', $a->user_id)->value('external_identity'),
            'connectionId' => $a->connection_id, 'senders' => app(DraftSenders::class)->choices($run),
            'attachments' => $a->arguments['attachments'] ?? [], 'editableFields' => ['from', 'to', 'subject', 'body', 'attachments'], 'fingerprint' => $a->fingerprint,
            'expiresAt' => $a->expires_at?->toIso8601String()];
    }

    private function saveRevision(ToolAction $a): void
    {
        DB::table('agent_draft_revisions')->insertOrIgnore(['action_id' => $a->id, 'revision' => (int) $a->draft_revision,
            'connection_id' => $a->connection_id, 'arguments' => json_encode($a->arguments), 'fingerprint' => $a->fingerprint, 'created_at' => now()]);
    }
}
