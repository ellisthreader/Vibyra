<?php
namespace App\Services\CloudWorkspaces;

use App\Models\VibyraSession;
use App\Services\Vibes\{TerminalCatalog, Wallet};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

final class Start
{
    public function accept(VibyraSession $session, string $id, array $data): array
    {
        app(FlyProvider::class)->preflight();
        return DB::transaction(function () use ($session, $id, $data) {
            app(Wallet::class)->lock($session->user_id);
            $w = app(Workspaces::class)->owned($session->user_id, $id);
            $q = DB::table('cloud_quotes')->where('id', $data['quoteId'])->where('workspace_id', $id)->where('user_id', $session->user_id)->firstOrFail();
            $p = json_decode($q->payload, true);
            if ($q->accepted_at) {
                abort_unless($data['consent'] === true && $q->accepted_proof_hash
                    && hash_equals($q->accepted_proof_hash, hash('sha256', $data['proof'])), 403, 'Retry with the original device proof or authorize access again.');
                abort_unless($w->operation_id === $q->id && $w->app_session_id === $session->id && $w->state !== 'deleted', 409, 'This start is no longer current.');
                $device = app(DeviceAuthorization::class)->device($session, $p['deviceId']);
                return ['workspace' => app(Workspaces::class)->payload($w), 'access' => app(Access::class)->issue($w, $session, $device)];
            }
            app(Eligibility::class)->authorize($session->user_id, true);
            abort_unless($data['consent'] === true && $p['sessionId'] === $session->id && now()->lt($q->expires_at)
                && $w->revision == $p['revision'] && in_array($w->state, ['stopped', 'archived'], true), 409, 'This quote expired or the project changed.');
            abort_unless($p['walletRevision'] === (string) (DB::table('vibes_ledger')->where('user_id', $session->user_id)->max('id') ?? 0), 409, 'Your balance changed. Refresh the quote.');
            abort_if($w->chat_id && DB::table('vibes_turns')->where('chat_id', $w->chat_id)->whereNull('settled_at')->exists(), 409, 'Wait for the previous AI usage to be reconciled before resuming.');
            $device = app(DeviceAuthorization::class)->consume($session, $p['deviceId'], $q->challenge_id, $data['proof'], DeviceAuthorization::purpose('start', $q->id));
            DB::table('cloud_workspace_control')->where('id', 1)->lockForUpdate()->firstOrFail();
            abort_if(DB::table('cloud_quotes')->where('user_id', $w->user_id)->where('accepted_at', '>=', now()->subHour())->count() >= config('cloud_workspaces.starts_per_account_hour')
                || DB::table('cloud_quotes')->where('user_id', $w->user_id)->where('accepted_at', '>=', now()->subDay())->count() >= config('cloud_workspaces.starts_per_account_day'), 429, 'Too many cloud starts. Try again later.');
            abort_if(DB::table('cloud_quotes')->where('accepted_at', '>=', now()->subDay())->count() >= config('cloud_workspaces.starts_per_global_day'), 503, 'Hosted startup capacity is reached for today.');
            abort_if(DB::table('cloud_workspaces')->where('user_id', $session->user_id)->whereIn('state', Workspaces::ACTIVE)->exists(), 409, 'Stop your other cloud computer first.');
            abort_if(DB::table('cloud_workspaces')->whereIn('state', Workspaces::ACTIVE)->count() >= config('cloud_workspaces.global_running_limit'), 503, 'Cloud computers are at capacity.');
            $model = app(TerminalCatalog::class)->resolve($p['model']);
            abort_unless($model['tools'], 422, 'Choose a model with project tools for cloud coding.');
            abort_unless(app(Wallet::class)->lock($session->user_id)->consented_at, 403, 'Allow AI processing before cloud coding.');
            $chat = $w->chat_id ?? (string) Str::uuid();
            if (!$w->chat_id) DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $w->user_id, 'title' => $w->name,
                'host_id' => 'cloud:'.$w->id, 'project_id' => $w->project_id, 'cloud_workspace_id' => $w->id, 'binding' => (string) Str::uuid(),
                'terminal_model' => $model['id'], 'terminal_model_name' => $model['name'], 'terminal_tools' => true,
                'terminal_budget_micro' => $p['budgetUnits'], 'created_at' => now(), 'updated_at' => now()]);
            else abort_unless(DB::table('vibes_chats')->where('id', $chat)->value('terminal_model') === $p['model'], 409, 'This workspace keeps its selected AI model.');
            DB::table('vibes_chats')->where('id', $chat)->update(['terminal_budget_micro' => $p['budgetUnits']]);
            DB::table('cloud_workspaces')->where('id', $id)->update(['state' => 'starting', 'operation_id' => $q->id,
                'generation' => $p['generation'], 'revision' => $w->revision + 1, 'chat_id' => $chat, 'app_session_id' => $session->id,
                'device_id' => $device->id, 'device_generation' => $device->authorization_generation, 'region' => $p['region'],
                'tariff_version' => $p['tariffVersion'], 'units_per_hour' => $p['unitsPerHour'], 'provider_micro_per_hour' => $p['providerMicroPerHour'],
                'budget_units' => $p['budgetUnits'], 'ready_at' => null, 'metered_at' => null, 'lease_until' => null, 'heartbeat_at' => null,
                'bootstrap_secret' => Crypt::encryptString(Str::random(64)), 'bootstrapped_at' => null, 'runtime_token_hash' => null,
                'stop_requested_at' => null, 'stop_reason' => null, 'deadline_at' => now()->addSeconds($p['seconds']), 'last_activity_at' => now(), 'updated_at' => now()]);
            $w = app(Workspaces::class)->owned($session->user_id, $id);
            app(Reservations::class)->reserve($w, Quotes::runway($w->units_per_hour));
            DB::table('cloud_quotes')->where('id', $q->id)->update(['accepted_at' => now(), 'accepted_proof_hash' => hash('sha256', $data['proof'])]);
            // Persisted starting state is the durable outbox. Reconciliation retries even if dispatch is lost.
            \App\Jobs\ReconcileCloudWorkspace::dispatch($id)->afterCommit();
            return ['workspace' => app(Workspaces::class)->payload($w), 'access' => app(Access::class)->issue($w, $session, $device)];
        }, 5);
    }
}
