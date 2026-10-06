<?php

namespace App\Services\Account;

use App\Models\User;
use App\Services\Remote\RemoteAccountSecurity;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Preserve remote disconnect evidence before user foreign keys cascade. */
final class AccountDeletion
{
    public function delete(User $user): bool
    {
        $userId = (int) $user->id;
        $this->assertNoRetainedBillingRows($userId);
        // Cloud workspace rows restrict account deletion and may require provider
        // shutdown/settlement, so clean them before taking remote identity locks.
        app(\App\Services\CloudWorkspaces\AccountCleanup::class)->prepare($userId);
        $security = app(RemoteAccountSecurity::class);
        return $security->updateIdentity((int) $user->id, function (User $locked) use ($security): bool {
            // Recheck under the user row lock: an in-flight purchase may have
            // committed while cloud cleanup was stopping or deleting resources.
            $this->assertNoRetainedBillingRows((int) $locked->id);
            $security->revokeHostsForDeletion((int) $locked->id);
            if (config('session.driver') === 'database') {
                DB::connection(config('session.connection'))->table((string) config('session.table', 'sessions'))
                    ->where('user_id', $locked->id)->delete();
            }
            DB::table('password_reset_tokens')->where('email', $locked->email)->delete();
            if (! $locked->delete()) throw new RuntimeException('The account could not be deleted.');
            return true;
        });
    }

    private function assertNoRetainedBillingRows(int $userId): void
    {
        foreach (['membership_orders', 'membership_owners', 'membership_periods'] as $table) {
            if (DB::table($table)->where('user_id', $userId)->exists()) {
                abort(409, 'Billing records must be detached before this account can be deleted.');
            }
        }
    }
}
