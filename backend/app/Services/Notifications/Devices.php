<?php
namespace App\Services\Notifications;
use App\Models\VibyraSession;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
final class Devices
{
    public function register(VibyraSession $session, array $data): array
    {
        abort_unless(config('intelligence.push') && config('intelligence.expo_project'), 503, 'Phone notifications are not configured yet.');
        abort_unless($data['projectId'] === config('intelligence.expo_project')
            && $data['environment'] === config('intelligence.environment'), 422, 'Wrong notification build environment.');
        return DB::transaction(function () use ($session, $data) {
            DB::table('users')->where('id', $session->user_id)->lockForUpdate()->firstOrFail();
            $hash = hash_hmac('sha256', $data['token'], config('app.key'));
            $proof = hash('sha256', $data['proof']);
            $same = DB::table('notification_devices')->where('user_id', $session->user_id)->where('installation', $data['installation'])->first();
            $installations = DB::table('notification_devices')->where('installation', $data['installation'])->lockForUpdate()->get();
            foreach ($installations as $installation) abort_unless(hash_equals($installation->proof_hash, $proof), 409, 'This notification installation cannot be verified.');
            DB::table('notification_devices')->where('installation', $data['installation'])->where('user_id', '!=', $session->user_id)->update(['revoked_at' => now()]);
            $token = DB::table('notification_devices')->where('token_hash', $hash)->lockForUpdate()->first();
            foreach (array_filter([$same, $token]) as $existing) {
                abort_unless(hash_equals($existing->proof_hash, $proof) && $existing->installation === $data['installation'],
                    409, 'This notification installation cannot be verified.');
            }
            // A verified installation may move to another signed-in account; retire the old recipient atomically.
            if ($token && $token->user_id !== $session->user_id) {
                DB::table('notification_devices')->where('id', $token->id)->delete();
            }
            $id = $same->id ?? (string) Str::uuid();
            DB::table('notification_devices')->updateOrInsert(['id' => $id], [
                'user_id' => $session->user_id, 'session_id' => $session->id, 'installation' => $data['installation'],
                'proof_hash' => $proof, 'token' => Crypt::encryptString($data['token']), 'token_hash' => $hash,
                'generation' => $same && $same->session_id === $session->id && $same->token_hash === $hash && !$same->revoked_at ? $same->generation : ($same->generation ?? 0) + 1, 'environment' => $data['environment'],
                'revoked_at' => null, 'visible_run' => null, 'present_until' => null, 'created_at' => $same->created_at ?? now(), 'updated_at' => now(),
            ]);
            app(Preferences::class)->get($session->user_id);
            return ['id' => $id];
        });
    }
    public function eligible(object $d): bool
    {
        if ($d->revoked_at || $d->environment !== config('intelligence.environment')) return false;
        $s = VibyraSession::find($d->session_id);
        return $s && $s->user_id === $d->user_id && !$s->revoked_at
            && $s->idle_expires_at && $s->absolute_expires_at
            && now()->lt($s->idle_expires_at) && now()->lt($s->absolute_expires_at);
    }
}
