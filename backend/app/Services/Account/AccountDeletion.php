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
        $security = app(RemoteAccountSecurity::class);
        return $security->updateIdentity((int) $user->id, function (User $locked) use ($security): bool {
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
}
