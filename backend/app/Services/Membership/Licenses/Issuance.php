<?php

namespace App\Services\Membership\Licenses;

use App\Models\User;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Issuance
{
    public function create(User $owner, array $terms): array
    {
        abort_unless(config('licenses.enabled') && config('membership.enabled'), 503, 'License creation is not available.');
        return DB::transaction(function () use ($owner, $terms) {
            User::whereKey($owner->id)->lockForUpdate()->firstOrFail();
            $request = $terms['request_id']; unset($terms['request_id']);
            ksort($terms);
            $hash = hash('sha256', json_encode($terms, JSON_THROW_ON_ERROR));
            $prior = DB::table('membership_licenses')->where('request_id', $request)->first();
            if ($prior) {
                abort_unless($prior->issued_by == $owner->id && hash_equals($prior->request_hash, $hash), 409, 'This creation request was already used.');
                return ['id' => $prior->id, 'key' => null, 'replayed' => true];
            }
            $key = Keys::generate(); $id = (string) Str::uuid();
            DB::table('membership_licenses')->insert([...$terms, 'id' => $id, 'key_hash' => Keys::hash($key),
                'key_suffix' => substr($key, -8), 'request_id' => $request, 'request_hash' => $hash,
                'issued_by' => $owner->id, 'created_at' => now(), 'updated_at' => now()]);
            self::audit($id, $owner->id, 'issued');
            return ['id' => $id, 'key' => $key, 'replayed' => false];
        }, 3);
    }

    public function revoke(string $id, User $owner): void
    {
        // Redemption takes wallet → license. If this read raced redemption, retry
        // with the committed recipient before acquiring the license lock again.
        for ($attempt = 0; $attempt < 3; $attempt++) {
            $recipient = DB::table('membership_licenses')->where('id', $id)->value('user_id');
            $done = DB::transaction(function () use ($id, $owner, $recipient) {
                if ($recipient) app(Wallet::class)->lock($recipient);
                $license = DB::table('membership_licenses')->where('id', $id)->lockForUpdate()->firstOrFail();
                if ($license->user_id != $recipient) return false;
                if ($license->revoked_at) return true;
                DB::table('membership_licenses')->where('id', $id)->update(['revoked_at' => now(), 'updated_at' => now()]);
                DB::table('membership_periods')->where('reference', 'license:'.$id)->update(['revoked_at' => now(), 'updated_at' => now()]);
                if ($recipient) app(Allowance::class)->remove($license);
                self::audit($id, $owner->id, 'revoked');
                return true;
            }, 3);
            if ($done) return;
        }
        abort(409, 'License changed. Refresh and try again.');
    }

    public static function audit(string $id, ?int $actor, string $event): void
    {
        DB::table('membership_license_audits')->insert(['license_id' => $id, 'actor_id' => $actor,
            'event' => $event, 'created_at' => now()]);
    }
}
