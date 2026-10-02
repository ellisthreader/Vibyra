<?php

namespace App\Services\Membership\Licenses;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

final class Pending
{
    /** Only trusted account-creation paths call this; never infer enrollment from client fields. */
    public function createUser(array $attributes, Request $request): User
    {
        return DB::transaction(function () use ($attributes, $request) {
            $user = User::create($attributes);
            $this->capture($user, $request, true);
            return $user->fresh();
        }, 3);
    }

    public function capture(User $user, Request $request, bool $newAccount = false): void
    {
        $hash = $request->attributes->get('license_hash');
        if (!$hash) return;
        DB::transaction(function () use ($user, $hash, $newAccount) {
            User::whereKey($user->id)->lock(DB::connection()->getDriverName() === 'pgsql' ? 'for no key update' : true)->firstOrFail();
            if ($newAccount && config('licenses.enabled')) app(\App\Services\Vibes\Wallet::class)->ensure($user, 0, true);
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
