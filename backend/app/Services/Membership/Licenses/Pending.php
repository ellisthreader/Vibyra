<?php

namespace App\Services\Membership\Licenses;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class Pending
{
    public function capture(User $user, Request $request): void
    {
        $hash = $request->attributes->get('license_hash');
        if (!$hash) return;
        DB::transaction(function () use ($user, $hash) {
            User::whereKey($user->id)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            DB::table('membership_license_claims')->updateOrInsert(['user_id' => $user->id], [
                'key_hash' => $hash, 'status' => 'pending_verification', 'expires_at' => now()->addDays(30),
                'created_at' => now(), 'updated_at' => now()]);
        });
        $this->complete($user);
    }

    public function complete(User $user): void
    {
        DB::transaction(function () use ($user) {
            $u = User::whereKey($user->id)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            if (!$u->hasVerifiedEmail()) return;
            $claim = DB::table('membership_license_claims')->where('user_id', $u->id)->lockForUpdate()->first();
            if (!$claim || $claim->status !== 'pending_verification') return;
            $status = 'unavailable';
            if (now()->lt($claim->expires_at)) {
                try {
                    app(Redemption::class)->redeem($u, $claim->key_hash);
                    $status = 'redeemed';
                } catch (HttpExceptionInterface $e) {
                    $status = $e->getStatusCode() === 409 ? 'conflict' : ($e->getStatusCode() === 503 ? 'disabled' : 'unavailable');
                }
            }
            DB::table('membership_license_claims')->where('user_id', $u->id)->update([
                'status' => $status, 'key_hash' => null, 'updated_at' => now()]);
        }, 3);
    }

    public function status(int $user): ?string
    {
        return DB::table('membership_license_claims')->where('user_id', $user)->value('status');
    }
}
