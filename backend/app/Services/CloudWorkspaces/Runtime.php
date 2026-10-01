<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

final class Runtime
{
    public function authenticate(string $id, string $token): object
    {
        $w = DB::table('cloud_workspaces')->where('id', $id)->first();
        abort_unless($w && $w->runtime_token_hash && hash_equals($w->runtime_token_hash, hash('sha256', $token))
            && in_array($w->state, Workspaces::ACTIVE, true), 401, 'Runtime authority expired.');
        return $w;
    }
    public function bootstrap(string $id, string $secret, string $machine, int $generation): array
    {
        return DB::transaction(function () use ($id, $secret, $machine, $generation) {
            $initial = DB::table('cloud_workspaces')->where('id', $id)->firstOrFail();
            app(Wallet::class)->lock($initial->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $id)->firstOrFail();
            abort_unless($w->state === 'starting' && $w->generation === $generation && $w->machine_id === $machine
                && $w->bootstrap_secret && hash_equals(Crypt::decryptString($w->bootstrap_secret), $secret), 401, 'Invalid managed runtime bootstrap.');
            $token = $w->runtime_secret ? Crypt::decryptString($w->runtime_secret) : Str::random(64);
            DB::table('cloud_workspaces')->where('id', $id)->update(['runtime_secret' => Crypt::encryptString($token),
                'runtime_token_hash' => hash('sha256', $token), 'bootstrapped_at' => now()]);
            $github = $w->source === 'github';
            if (($w->kind ?? 'project') === 'computer') {
                // The VM volume is the source of truth; nothing is uploaded or cloned by the control plane.
                $source = ['type' => 'computer']; $project = ['files' => [], 'base' => []];
            } elseif ($github) {
                $installs = app(\App\Services\ChatConnectors\Installs::class);
                abort_unless(in_array('github', $installs->installed($w->user_id), true), 409, 'GitHub is no longer connected.');
                $saved = $w->checkpoint ? app(Artifacts::class)->read($w) : ['files' => []];
                // Fetched fresh for this boot only; never stored, never logged.
                $source = ['type' => 'github', 'repo' => $w->repo, 'ref' => $w->ref, 'baseCommit' => $w->base_commit, 'token' => $installs->credential($w->user_id, 'github')];
                $project = ['files' => $saved['files'], 'base' => $saved['base'] ?? []];
            } else { $source = ['type' => 'upload']; $project = app(Artifacts::class)->read($w); }
            return ['mode' => ($w->kind ?? 'project') === 'computer' ? 'computer' : 'project', 'token' => $token, 'checkpoint' => $w->checkpoint, 'source' => $source, 'project' => $project,
                'limits' => ['files' => config('cloud_workspaces.max_files'), 'fileBytes' => config('cloud_workspaces.max_file_bytes'),
                    'projectBytes' => config('cloud_workspaces.max_project_bytes')]];
        }, 5);
    }
    public function heartbeat(object $initial, bool $ready): array
    {
        return DB::transaction(function () use ($initial, $ready) {
            app(Wallet::class)->lock($initial->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $initial->id)->lockForUpdate()->firstOrFail();
            abort_unless($w->generation === $initial->generation && $w->runtime_token_hash === $initial->runtime_token_hash, 401, 'Runtime generation changed.');
            if ($w->state === 'starting') {
                abort_unless($ready && ($w->checkpoint_at || $w->kind === 'computer') && now()->lt($w->deadline_at), 409, 'Complete verified project setup before readiness.');
                app(Eligibility::class)->authorize($w->user_id);
                DB::table('cloud_workspaces')->where('id', $w->id)->update(['state' => 'ready', 'ready_at' => now(), 'metered_at' => now(),
                    'bootstrap_secret' => null, 'runtime_secret' => null, 'last_activity_at' => $w->kind === 'computer' ? now() : $w->last_activity_at, 'lease_until' => min(now()->addSeconds(config('cloud_workspaces.lease_seconds')), \Illuminate\Support\Carbon::parse($w->deadline_at))]);
            } elseif ($w->state === 'ready') {
                $reason = app(Lifecycle::class)->stopReason($w);
                if ($reason) app(Shutdown::class)->request($w->user_id, $w->id, $reason);
                else {
                    // Replace the old runway atomically. On failure it still covers shutdown.
                    try {
                        DB::transaction(function () use ($w) {
                            app(Meter::class)->settle($w);
                            $fresh = DB::table('cloud_workspaces')->where('id', $w->id)->first();
                            app(Reservations::class)->reserve($fresh, Quotes::runway($w->units_per_hour));
                        });
                        DB::table('cloud_workspaces')->where('id', $w->id)->update(['lease_until' => min(now()->addSeconds(config('cloud_workspaces.lease_seconds')), \Illuminate\Support\Carbon::parse($w->deadline_at))]);
                    } catch (\Symfony\Component\HttpKernel\Exception\HttpException) {
                        app(Shutdown::class)->request($w->user_id, $w->id, 'budget_or_balance');
                    }
                }
            }
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['heartbeat_at' => now()]);
            $w = DB::table('cloud_workspaces')->where('id', $w->id)->first();
            return ['state' => $w->state, 'lease' => $w->lease_until ? app(Leases::class)->issue($w) : null,
                'stop' => $w->state !== 'ready', 'checkpoint' => $w->checkpoint];
        }, 5);
    }
    public function checkpoint(object $initial, array $files, ?array $base = null, ?string $baseCommit = null): array
    {
        return DB::transaction(function () use ($initial, $files, $base, $baseCommit) {
            app(Wallet::class)->lock($initial->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $initial->id)->firstOrFail();
            abort_unless($w->generation === $initial->generation && $w->runtime_token_hash === $initial->runtime_token_hash && in_array($w->state, Workspaces::ACTIVE, true), 409);
            if ($w->kind === 'computer') return ['checkpoint' => null, 'saved' => true];
            $update = [];
            if ($w->source === 'github') {
                abort_unless($baseCommit !== null || $w->base_commit, 422, 'The base commit is required.');
                abort_if($baseCommit !== null && $w->base_commit && $w->base_commit !== $baseCommit, 409, 'The base commit changed.');
                if (!$w->base_commit) $update['base_commit'] = $baseCommit;
                $hash = app(Artifacts::class)->save($w, $files, $base ?? []);
            } else $hash = app(Artifacts::class)->save($w, $files);
            $backgroundPossible = $w->state === 'ready' && DB::table('cloud_actions')->where('workspace_id', $w->id)->where('generation', $w->generation)
                ->where('operation', 'cloud_run_command')->whereNotNull('claimed_at')->exists();
            DB::table('cloud_workspaces')->where('id', $w->id)->update([...$update, 'checkpoint' => $hash, 'checkpoint_at' => now(), 'unsaved_possible' => $backgroundPossible]);
            app(Retention::class)->prune(DB::table('cloud_workspaces')->where('id', $w->id)->first());
            return ['checkpoint' => $hash, 'saved' => true];
        }, 5);
    }
    public function claim(object $initial): ?object
    {
        return DB::transaction(function () use ($initial) {
            app(Wallet::class)->lock($initial->user_id);
            $w = DB::table('cloud_workspaces')->where('id', $initial->id)->firstOrFail();
            abort_unless($w->generation === $initial->generation && $w->runtime_token_hash === $initial->runtime_token_hash, 401, 'Runtime generation changed.');
            if ($w->state !== 'ready' || !$w->lease_until || now()->gte($w->lease_until)) return null;
            if (DB::table('cloud_actions')->where('workspace_id', $w->id)->where('generation', $w->generation)->where('state', 'running')->exists()) return null;
            DB::table('cloud_actions')->where('workspace_id', $w->id)->where('state', 'queued')->where('expires_at', '<=', now())->update(['state' => 'expired']);
            $a = DB::table('cloud_actions')->where('workspace_id', $w->id)->where('generation', $w->generation)
                ->where('state', 'queued')->orderBy('created_at')->first();
            if (!$a) return null;
            DB::table('cloud_actions')->where('id', $a->id)->where('state', 'queued')->update(['state' => 'running', 'claimed_at' => now(), 'updated_at' => now()]);
            if (in_array($a->operation, ['write_file', 'cloud_run_command'], true)) DB::table('cloud_workspaces')->where('id', $w->id)->update(['unsaved_possible' => true]);
            return $a;
        }, 5);
    }
    public function result(object $w, string $id, array $result): object
    {
        return DB::transaction(function () use ($w, $id, $result) {
            app(Wallet::class)->lock($w->user_id);
            $fresh = DB::table('cloud_workspaces')->where('id', $w->id)->firstOrFail();
            abort_unless($fresh->generation === $w->generation && $fresh->runtime_token_hash === $w->runtime_token_hash && in_array($fresh->state, Workspaces::ACTIVE, true), 401, 'Runtime generation changed.');
            $a = DB::table('cloud_actions')->where('id', $id)->where('workspace_id', $w->id)->where('generation', $w->generation)->firstOrFail();
            $encoded = json_encode($result, JSON_THROW_ON_ERROR);
            abort_if(strlen($encoded) > 262144, 422, 'Cloud output exceeds the allowed size.');
            if ($a->result !== null) { abort_unless($a->result === $encoded, 409, 'Command already has another result.'); return $a; }
            abort_unless($a->state === 'running', 409, 'This action is no longer running.');
            DB::table('cloud_actions')->where('id', $id)->update(['state' => 'completed', 'result' => $encoded, 'updated_at' => now()]);
            DB::table('cloud_workspaces')->where('id', $w->id)->update(['last_activity_at' => now()]);
            return DB::table('cloud_actions')->where('id', $id)->first();
        }, 5);
    }
}
