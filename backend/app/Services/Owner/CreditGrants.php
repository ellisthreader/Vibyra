<?php

namespace App\Services\Owner;

use App\Models\User;
use App\Services\Membership\{NewAccounts, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

final class CreditGrants
{
    /** Called under the user lock; never migrate or initialize billing implicitly. */
    public function apply(User $user, array $input): array
    {
        abort_if($user->isGuest() || $user->owner_banned_at, 409, 'This account cannot receive a grant in its current state.');
        $wallet = DB::table('vibes_wallets')->where('user_id', $user->id)->lockForUpdate()->first();
        $modern = $wallet && (int) $wallet->billing_version === 2;
        $type = $input['balance'];
        $amount = (int) $input['amount'];
        $reference = 'owner-grant:'.$input['request_id'];
        if ($type === 'credits') {
            abort_if($modern || NewAccounts::eligible($user), 409, 'The wallet changed. Refresh this account before granting credits.');
            app(\App\Services\Billing\CreditDeductor::class)->grant($user, $amount, 'owner', $reference,
                ['owner_action' => $input['request_id']]);
            $scale = 1;
        } else {
            abort_unless($wallet && ($modern ? $type === 'tokens' : $type === 'vibes'), 409,
                'The wallet changed or is not initialized. Refresh this account.');
            $scale = $modern ? Units::SCALE : 1;
            app(Wallet::class)->grant($user->id, $reference, 'owner', $amount * $scale);
        }
        return ['balance' => $type, 'amount' => $amount, 'units' => (string) ($amount * $scale), 'scale' => $scale];
    }
}
