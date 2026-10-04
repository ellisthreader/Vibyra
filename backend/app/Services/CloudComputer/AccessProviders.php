<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;

/**
 * Which AI logins Vibyra Cloud may receive from the Mac (docs/cloud-access-contract.md). Only Codex can be carried over;
 * `blocked` refuses new login uploads and drops a pending one. The Mac's own opt-in switch is still needed to send anything.
 */
class AccessProviders
{
    public const CARRY_OVER = ['allowed', 'blocked'];

    public function codexCarryOver(int $user): string
    {
        $v = DB::table('cloud_access_settings')->where('user_id', $user)->value('codex_carry_over');
        return in_array($v, self::CARRY_OVER, true) ? $v : 'allowed';
    }

    public function blocked(int $user, string $provider): bool
    {
        return $provider === 'codex' && $this->codexCarryOver($user) === 'blocked';
    }

    public function setCodex(int $user, string $carryOver): void
    {
        DB::table('cloud_access_settings')->upsert([['user_id' => $user, 'codex_carry_over' => $carryOver, 'created_at' => now(), 'updated_at' => now()]],
            ['user_id'], ['codex_carry_over', 'updated_at']);
        if ($carryOver === 'blocked') app(SyncLogins::class)->remove($user, 'codex');
    }

    /** `providers` for GET /access. `sent`: the Mac has carried a Codex login at least once. */
    public function payload(int $user): array
    {
        $codex = app(SyncLogins::class)->payload($user)['codex'];
        return ['codex' => ['carryOver' => $this->codexCarryOver($user), 'sent' => $codex['seq'] > 0, 'appliedAt' => $codex['appliedAt']],
            'claude' => ['carryOver' => 'unsupported']];
    }
}
