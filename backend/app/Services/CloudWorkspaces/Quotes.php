<?php
namespace App\Services\CloudWorkspaces;

use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Quotes
{
    public function create(VibyraSession $session, object $w, array $data): array
    {
        return DB::transaction(function () use ($session, $w, $data) {
            app(Wallet::class)->lock($session->user_id);
            app(Eligibility::class)->authorize($session->user_id, true);
            $w = app(Workspaces::class)->owned($session->user_id, $w->id);
            abort_if(!$data['canWrite'] && ($data['commands'] ?? []), 422, 'Allow file edits before approving shell commands, which can modify this project.');
            abort_unless(in_array($w->state, ['stopped', 'archived'], true) && $w->checkpoint && $w->revision == $data['revision'], 409, 'Refresh this stopped cloud project first.');
            $id = (string) Str::uuid();
            $challenge = app(DeviceAuthorization::class)->challenge($session, $data['deviceId'], DeviceAuthorization::purpose('start', $id));
            $payload = ['workspaceId' => $w->id, 'revision' => (string) $w->revision, 'generation' => $w->generation + 1,
                'walletRevision' => (string) (DB::table('vibes_ledger')->where('user_id', $session->user_id)->max('id') ?? 0),
                'deviceId' => $data['deviceId'], 'sessionId' => $session->id, 'model' => $data['model'],
                'budgetUnits' => $data['budgetUnits'], 'seconds' => $data['seconds'], 'commands' => $data['commands'] ?? [],
                'canWrite' => $data['canWrite'], 'region' => config('cloud_workspaces.region'), 'unitsPerHour' => config('cloud_workspaces.units_per_hour'),
                'providerMicroPerHour' => config('cloud_workspaces.provider_micro_per_hour'), 'tariffVersion' => config('cloud_workspaces.tariff_version'), 'policyVersion' => 1];
            DB::table('cloud_quotes')->insert(['id' => $id, 'workspace_id' => $w->id, 'user_id' => $session->user_id,
                'payload' => json_encode($payload), 'challenge_id' => $challenge['challengeId'], 'expires_at' => now()->addSeconds(120), 'created_at' => now(), 'updated_at' => now()]);
            return ['id' => $id, ...$payload, 'challenge' => $challenge, 'expiresAt' => now()->addSeconds(120)->timestamp,
                'minimumUnits' => (string) self::runway((int) $payload['unitsPerHour']), 'unitScale' => 10000,
                'storage' => ['included' => true, 'volumeGiB' => config('cloud_workspaces.volume_gib'), 'archiveDays' => config('cloud_workspaces.archive_days'), 'checkpointHistory' => config('cloud_workspaces.checkpoint_history')]];
        });
    }
    public static function runway(int $rate): int
    {
        return intdiv($rate * config('cloud_workspaces.runway_seconds') + 3599, 3600);
    }
}
