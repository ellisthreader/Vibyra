<?php
namespace App\Services\CloudComputer;

use App\Services\CloudWorkspaces\Git\GitRefused;
use App\Services\CloudWorkspaces\Workspaces;
use Illuminate\Support\Facades\DB;

/**
 * Which AI accounts and integrations Vibyra Cloud may use (docs/cloud-access-contract.md).
 * - `claude_enabled` / `codex_enabled`: the Cloud Host neither offers nor runs a turned-off agent (the list reaches the VM
 *   in the host activity reply, `disabledProviders`). Codex off also blocks legacy login carry-over; Cloud-owned sign-ins remain stored but cannot be used.
 * - `github_enabled`: off refuses every GitHub use for Cloud (repo list, clone credentials, repo projects, pull requests).
 * - `codex_carry_over`: only Codex can be carried over; `blocked` refuses new login uploads and drops a pending one. The
 *   Mac's own opt-in switch is still needed to send anything.
 * No settings row preserves legacy defaults; new setup submits explicit choices.
 */
class AccessProviders
{
    public const CARRY_OVER = ['allowed', 'blocked'];
    public const SWITCHES = ['claude', 'codex', 'github'];
    public const GITHUB_OFF = 'GitHub is turned off for Vibyra Cloud. Turn it on in Cloud settings.';

    public function codexCarryOver(int $user): string
    {
        $v = DB::table('cloud_access_settings')->where('user_id', $user)->value('codex_carry_over');
        return in_array($v, self::CARRY_OVER, true) ? $v : 'allowed';
    }

    public function blocked(int $user, string $provider): bool
    {
        return $provider === 'codex' && ($this->codexCarryOver($user) === 'blocked' || !$this->enabled($user, 'codex'));
    }

    public function setCodex(int $user, string $carryOver): void
    {
        DB::table('cloud_access_settings')->upsert([['user_id' => $user, 'codex_carry_over' => $carryOver, 'created_at' => now(), 'updated_at' => now()]],
            ['user_id'], ['codex_carry_over', 'updated_at']);
        if ($carryOver === 'blocked') app(SyncLogins::class)->remove($user, 'codex');
    }

    /** `claude`, `codex` or `github`. */
    public function enabled(int $user, string $what): bool
    {
        $v = DB::table('cloud_access_settings')->where('user_id', $user)->value($what.'_enabled');
        return $v === null || (bool) $v;
    }

    /** Turning Codex off also blocks its carry-over (and drops a pending login); turning it on leaves carry-over as it was. */
    public function setEnabled(int $user, string $what, bool $on): void
    {
        abort_unless(in_array($what, self::SWITCHES, true), 404);
        if (!$on && in_array($what, ['claude', 'codex'], true)) $this->requireRuntimePolicy($user);
        $col = $what.'_enabled';
        DB::table('cloud_access_settings')->upsert([['user_id' => $user, $col => $on, 'created_at' => now(), 'updated_at' => now()]],
            ['user_id'], [$col, 'updated_at']);
        if ($what === 'codex' && !$on) $this->setCodex($user, 'blocked');
    }

    /** An older active Host cannot enforce the setting. Never stop someone's work to upgrade it. */
    private function requireRuntimePolicy(int $user): void
    {
        $w = DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')
            ->whereIn('state', Workspaces::ACTIVE)->first(['host_provider_policy_version']);
        if ($w && (int) $w->host_provider_policy_version < 1) Computers::fail('cloud_update_required',
            'Cloud needs an update before changing AI account access. Finish its current work, then stop and wake Cloud.', 409);
    }

    /** `{claude?, codex?, github?}` from the Connect page; keys left out stay as they are. */
    public function apply(int $user, array $accounts): void
    {
        foreach (self::SWITCHES as $what) if (array_key_exists($what, $accounts)) $this->setEnabled($user, $what, (bool) $accounts[$what]);
    }

    /** @return list<string> the agents the Cloud Host must not offer or run */
    public function disabledProviders(int $user): array
    {
        return array_values(array_filter(['claude', 'codex'], fn ($p) => !$this->enabled($user, $p)));
    }

    /** Every GitHub use for Vibyra Cloud. 403 `github_disabled`. */
    public function requireGithub(int $user): void
    {
        if (!$this->enabled($user, 'github')) throw new GitRefused('github_disabled', self::GITHUB_OFF, 403);
    }

    /** `providers` for GET /access. `sent`: the Mac has carried a Codex login at least once. */
    public function payload(int $user): array
    {
        $logins = app(SyncLogins::class)->payload($user); $codex = $logins['codex'];
        $own = fn (array $l) => ['appliedAt' => $l['origin'] === 'cloud' ? $l['appliedAt'] : null, 'pending' => $l['origin'] === 'cloud' && $l['pending']];
        return ['codex' => ['enabled' => $this->enabled($user, 'codex'), 'carryOver' => $this->codexCarryOver($user), 'sent' => $codex['seq'] > 0,
                'appliedAt' => $codex['appliedAt'], 'cloudLogin' => $own($codex)],
            'claude' => ['enabled' => $this->enabled($user, 'claude'), 'carryOver' => 'unsupported', 'cloudLogin' => $own($logins['claude'])]];
    }

    /** `integrations` for GET /access. */
    public function integrations(int $user): array
    {
        return ['github' => ['enabled' => $this->enabled($user, 'github')]];
    }
}
