<?php
namespace App\Services\LiveActivities;

use App\Jobs\SendLiveActivityUpdate;
use App\Models\VibyraSession;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/** Encrypted per-run activity tokens and the per-device push-to-start token. */
final class Tokens
{
    public const HEX = '/^[0-9a-f]{32,256}$/i';

    /** The registered, current-session device this request may attach tokens to. */
    public function device(VibyraSession $session, string $deviceId): object
    {
        $device = DB::table('notification_devices')->where('id', $deviceId)->where('user_id', $session->user_id)
            ->where('session_id', $session->id)->whereNull('revoked_at')->first();
        abort_unless($device, 404, 'Enable notifications on this iPhone first.');
        return $device;
    }

    public function registerActivity(VibyraSession $session, string $deviceId, string $runId, string $agentId, string $token): array
    {
        $device = $this->device($session, $deviceId);
        $run = DB::table('agent_runs')->where('id', $runId)->where('user_id', $session->user_id)->first(['id', 'agent_id']);
        // A card for a conversation on the Cloud Host has no agent run; the account's own phase events name it.
        abort_unless(($run && $run->agent_id === $agentId) || (!$run && app(CloudHostCards::class)->owns((int) $session->user_id, $runId)), 404, 'That task was not found.');
        $hash = hash_hmac('sha256', strtolower($token), config('app.key'));
        $id = DB::transaction(function () use ($session, $device, $runId, $agentId, $token, $hash) {
            // A token is unique across accounts; whoever registers it last owns it.
            DB::table('live_activity_tokens')->where('token_hash', $hash)->where(fn ($q) => $q->where('device_id', '!=', $device->id)->orWhere('run_id', '!=', $runId))->delete();
            $existing = DB::table('live_activity_tokens')->where('device_id', $device->id)->where('run_id', $runId)->first();
            $id = $existing->id ?? (string) Str::uuid();
            $changed = !$existing || $existing->token_hash !== $hash || $existing->revoked_at || $existing->ended_at;
            DB::table('live_activity_tokens')->updateOrInsert(['id' => $id], [
                'user_id' => $session->user_id, 'device_id' => $device->id, 'run_id' => $runId, 'agent_id' => $agentId,
                'token' => Crypt::encryptString(strtolower($token)), 'token_hash' => $hash, 'generation' => $device->generation,
                // A new token has seen nothing yet; the next send must bring it up to date.
                'last_phase' => $changed ? null : $existing->last_phase, 'last_sent_at' => $changed ? null : $existing->last_sent_at,
                'ended_at' => null, 'revoked_at' => null, 'created_at' => $existing->created_at ?? now(), 'updated_at' => now(),
            ]);
            return $id;
        });
        // The run may have moved while the phone was starting its card: send the current state now.
        SendLiveActivityUpdate::dispatch($runId)->afterCommit();
        return ['id' => $id];
    }

    public function registerPushToStart(VibyraSession $session, string $deviceId, string $token): void
    {
        $device = $this->device($session, $deviceId);
        $hash = hash_hmac('sha256', strtolower($token), config('app.key'));
        DB::table('notification_devices')->where('push_to_start_hash', $hash)->where('id', '!=', $device->id)
            ->update(['push_to_start_token' => null, 'push_to_start_hash' => null, 'push_to_start_at' => null]);
        DB::table('notification_devices')->where('id', $device->id)->update([
            'push_to_start_token' => Crypt::encryptString(strtolower($token)), 'push_to_start_hash' => $hash, 'push_to_start_at' => now()]);
    }

    public function forgetPushToStart(VibyraSession $session, string $deviceId): void
    {
        $device = $this->device($session, $deviceId);
        DB::table('notification_devices')->where('id', $device->id)
            ->update(['push_to_start_token' => null, 'push_to_start_hash' => null, 'push_to_start_at' => null]);
    }

    /** The phone's card for this run ended or was dismissed: stop updating it. */
    public function endRun(VibyraSession $session, string $deviceId, string $runId): void
    {
        $device = $this->device($session, $deviceId);
        DB::table('live_activity_tokens')->where('device_id', $device->id)->where('run_id', $runId)->update(['ended_at' => now(), 'updated_at' => now()]);
    }

    /** Sign-out, device removal and a switched account all land here. */
    public function revokeDevice(string $deviceId): void
    {
        DB::table('live_activity_tokens')->where('device_id', $deviceId)->delete();
        DB::table('notification_devices')->where('id', $deviceId)->update(['push_to_start_token' => null, 'push_to_start_hash' => null, 'push_to_start_at' => null]);
    }

    public function revokeUser(int $userId): void
    {
        DB::table('live_activity_tokens')->where('user_id', $userId)->delete();
        DB::table('notification_devices')->where('user_id', $userId)->update(['push_to_start_token' => null, 'push_to_start_hash' => null, 'push_to_start_at' => null]);
    }

    public function revokeToken(string $id): void
    {
        DB::table('live_activity_tokens')->where('id', $id)->delete();
    }
}
