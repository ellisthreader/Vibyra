<?php

namespace App\Services\Account;

use App\Models\User;
use App\Services\Remote\RemoteAccountSecurity;
use Illuminate\Support\Facades\{DB, Storage};
use RuntimeException;

/** Preserve remote disconnect evidence before user foreign keys cascade. */
final class AccountDeletion
{
    public function delete(User $user, ?array $appleRevocation = null): bool
    {
        $security = app(RemoteAccountSecurity::class);
        return $security->updateIdentity((int) $user->id, function (User $locked) use ($security, $appleRevocation): bool {
            if ($locked->provider === 'apple') app(AppleRevocationQueue::class)->stage((int) $locked->id, $appleRevocation);
            $security->revokeHostsForDeletion((int) $locked->id);
            if (config('session.driver') === 'database') {
                DB::connection(config('session.connection'))->table((string) config('session.table', 'sessions'))
                    ->where('user_id', $locked->id)->delete();
            }
            DB::table('password_reset_tokens')->where('email', $locked->email)->delete();
            $exports = \App\Services\Privacy\AccountExports::class;
            if (\App\Models\AccountExport::query()->where('user_id', $locked->id)->exists()
                && !Storage::disk($exports::disk())->deleteDirectory($exports::directory((int) $locked->id))) {
                throw new RuntimeException('The account archive could not be removed.');
            }
            if (! $locked->delete()) throw new RuntimeException('The account could not be deleted.');
            return true;
        });
    }
}
