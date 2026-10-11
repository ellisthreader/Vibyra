<?php

namespace App\Services\Teams;

use Illuminate\Support\Facades\DB;

/** SSO just-in-time provisioning cannot silently reverse a deliberate removal. */
final class Offboarding
{
    public static function record(string $organisation, int $user): void
    {
        DB::table('organization_removed_members')->updateOrInsert(
            ['organization_id' => $organisation, 'user_id' => $user], ['removed_at' => now()]);
        // An unused invitation can predate a JIT SSO join. It must not undo a later removal.
        $email = DB::table('users')->where('id', $user)->value('email');
        if (is_string($email)) DB::table('organization_invitations')->where('organization_id', $organisation)
            ->where('email', strtolower($email))->whereNull('accepted_at')->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    public static function blocked(string $organisation, int $user): bool
    {
        return DB::table('organization_removed_members')->where('organization_id', $organisation)->where('user_id', $user)->exists();
    }

    /** Only acceptance of a fresh, explicitly issued invitation restores provisioning. */
    public static function restore(string $organisation, int $user): void
    {
        DB::table('organization_removed_members')->where('organization_id', $organisation)->where('user_id', $user)->delete();
    }
}
