<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

final class Workspaces
{
    public const ACTIVE = ['starting', 'ready', 'stopping', 'recovery_required'];
    public function owned(int $user, string $id): object
    {
        return DB::table('cloud_workspaces')->where('id', $id)->where('user_id', $user)->firstOrFail();
    }
    /** Legacy hosted-project routes: a cloud computer id is not found here (it has its own terms, passkey and revocation rules). */
    public function ownedProject(int $user, string $id): object
    {
        return DB::table('cloud_workspaces')->where('id', $id)->where('user_id', $user)->where('kind', 'project')->firstOrFail();
    }
    public function create(int $user, array $data): object
    {
        return DB::transaction(function () use ($user, $data) {
            app(Wallet::class)->lock($user);
            app(Eligibility::class)->authorize($user);
            $source = ($data['source']['type'] ?? null) === 'github' ? $data['source'] : null;
            if ($source && !in_array('github', app(\App\Services\ChatConnectors\Installs::class)->installed($user), true)) {
                throw new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['ok' => false, 'code' => 'github_not_connected',
                    'message' => 'Connect GitHub before continuing this project in the cloud.'], 409));
            }
            $old = DB::table('cloud_workspaces')->where('id', $data['id'])->first();
            if ($old) {
                abort_unless($old->user_id == $user && $old->name === $data['name'] && $old->project_id === $data['projectId']
                    && $old->source === ($source ? 'github' : 'upload') && $old->repo === ($source['repo'] ?? null) && $old->ref === ($source['ref'] ?? null), 409, 'This creation ID was already used.');
                return $old;
            }
            abort_if(DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'project')->where('state', '!=', 'deleted')->count() >= config('cloud_workspaces.max_workspaces'), 422, 'Archive or delete an unused cloud project first.');
            app(SpendGuard::class)->admitCreate();
            DB::table('cloud_workspaces')->insert(['id' => $data['id'], 'user_id' => $user, 'name' => $data['name'], 'project_id' => $data['projectId'],
                'app_name' => 'vibyra-ws-'.str_replace('-', '', $data['id']), 'created_at' => now(), 'updated_at' => now(),
                ...($source ? ['source' => 'github', 'repo' => $source['repo'], 'ref' => $source['ref'] ?? null, 'state' => 'stopped',
                    'retention_until' => now()->addDays(config('cloud_workspaces.archive_days'))] : [])]);
            return $this->owned($user, $data['id']);
        });
    }
    public function import(int $user, string $id, int $revision, array $files): object
    {
        return DB::transaction(function () use ($user, $id, $revision, $files) {
            app(Wallet::class)->lock($user);
            $w = $this->ownedProject($user, $id);
            abort_unless($w->state === 'draft' && $w->revision == $revision, 409, 'This project was already imported or changed.');
            $hash = app(Artifacts::class)->save($w, $files);
            DB::table('cloud_workspaces')->where('id', $id)->update(['state' => 'stopped', 'base_checkpoint' => $hash, 'checkpoint' => $hash,
                'checkpoint_at' => now(), 'revision' => $w->revision + 1, 'retention_until' => now()->addDays(config('cloud_workspaces.archive_days')), 'updated_at' => now()]);
            return $this->owned($user, $id);
        }, 3);
    }
    public function payload(object $w): array
    {
        $held = (int) DB::table('cloud_reservations')->where('workspace_id', $w->id)->whereNull('settled_at')->sum('reserved');
        $ai = $w->chat_id ? (int) DB::table('vibes_turns')->where('chat_id', $w->chat_id)->sum('charged') : 0;
        $aiHeld = $w->chat_id ? (int) DB::table('vibes_turns')->where('chat_id', $w->chat_id)->whereNull('settled_at')->sum('reserved') : 0;
        $chat = $w->chat_id ? DB::table('vibes_chats')->where('id', $w->chat_id)->first() : null;
        return ['id' => $w->id, 'name' => $w->name, 'projectId' => $w->project_id, 'hostKind' => 'managed', 'state' => $w->state,
            'revision' => (string) $w->revision, 'generation' => $w->generation, 'region' => $w->region, 'shape' => 'performance-2x-4gb',
            'chatId' => $w->chat_id, 'model' => $chat?->terminal_model, 'modelName' => $chat?->terminal_model_name,
            'budgetUnits' => (string) $w->budget_units, 'runtimeChargedUnits' => (string) $w->runtime_charged_units,
            'aiChargedUnits' => (string) $ai, 'runtimeHeldUnits' => (string) $held, 'aiHeldUnits' => (string) $aiHeld, 'heldUnits' => (string) ($held + $aiHeld), 'committedUnits' => (string) app(Budgets::class)->committed($w),
            'unitScale' => 10000, 'unitsPerHour' => (string) $w->units_per_hour, 'tariffVersion' => $w->tariff_version,
            'checkpoint' => $w->checkpoint, 'checkpointAt' => $w->checkpoint_at, 'deadlineAt' => $w->deadline_at,
            'leaseUntil' => $w->lease_until, 'retentionUntil' => $w->retention_until, 'stopReason' => $w->stop_reason, 'mayHaveUnsavedChanges' => (bool) $w->unsaved_possible,
            'source' => $w->source === 'github' ? ['type' => 'github', 'repo' => $w->repo, 'ref' => $w->ref, 'baseCommit' => $w->base_commit] : ['type' => 'upload']];
    }
}
