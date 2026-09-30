<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\DB;

final class AccountCleanup
{
    /** Stop/settle/delete before the account's wallet and source permissions disappear. */
    public function prepare(int $user): void
    {
        if (!Holds::available()) return;
        foreach (DB::table('cloud_workspaces')->where('user_id', $user)->where('state', '!=', 'deleted')->get() as $w) {
            if (in_array($w->state, Workspaces::ACTIVE, true)) {
                app(Shutdown::class)->request($user, $w->id, 'account_deletion');
                app(Lifecycle::class)->reconcile($w->id);
                $w = DB::table('cloud_workspaces')->where('id', $w->id)->first();
            }
            abort_unless(in_array($w->state, ['draft', 'stopped', 'archived', 'expired', 'deleting'], true), 409, 'Your cloud computer is saving and stopping. Retry account deletion shortly.');
            app(Deletion::class)->delete($w);
        }
        DB::table('cloud_quotes')->where('user_id', $user)->update(['payload' => '{}']);
        DB::table('cloud_workspaces')->where('user_id', $user)->delete();
    }
}
