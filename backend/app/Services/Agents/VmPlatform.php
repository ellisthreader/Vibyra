<?php

namespace App\Services\Agents;

use Illuminate\Support\Facades\DB;

/** VM shell execution is currently implemented by the macOS runner only. */
final class VmPlatform
{
    public static function supports(?string $platform): bool
    {
        return $platform === 'macos';
    }

    public static function allows(?object $grant): bool
    {
        return $grant !== null && (bool) $grant->can_test
            && config('agents.vm_tests_enabled')
            && self::supports(DB::table('remote_hosts')->where('user_id', $grant->user_id)
                ->where('host_id', $grant->host_id)->whereNull('revoked_at')->value('platform'));
    }
}
