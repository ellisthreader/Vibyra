<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationMember, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Membership\Units;
use App\Services\Spend\{Counters, Refusal};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/**
 * A team's default monthly spend cap per member (roadmap Parts 5 and 13). There is no shared wallet: the cap seeds the member's OWN
 * Part 5 monthly cap (`vibes_wallets.cap_month_units`). The member may lower it freely; going above it, or switching it off, needs an
 * admin, who sets a per-member ceiling. The ceiling is `organization_members.month_cap_units` or, when none, the team default.
 * Leaving the team ends the ceiling and keeps whatever cap the person then has, because it is their own wallet.
 */
final class MemberCaps
{
    /** The most this person may set their own monthly cap to, in canonical units; null when no team limit applies. */
    public function ceiling(int $userId): ?int
    {
        if (!Teams::enabled() || !config('teams.member_caps_enabled')) return null;
        $m = OrganizationMember::query()->where('user_id', $userId)->first();
        if (!$m) return null;
        $value = $m->month_cap_units ?? Organization::query()->whereKey($m->organization_id)->value('member_month_cap_units');
        return $value === null ? null : (int) $value;
    }

    /** Called from the member's own Spend\Settings::save: lowering is free, raising past the ceiling or switching off is not. */
    public function assertMayChange(int $userId, ?float $tokens): void
    {
        $ceiling = $this->ceiling($userId);
        if ($ceiling === null) return;
        if ($tokens === null || (int) round($tokens * Units::SCALE) > $ceiling) $this->refuse($ceiling);
    }

    /** "Raise for this month" would pass the ceiling the same way. */
    public function assertMayRaise(int $userId, string $kind): void
    {
        if ($kind !== 'month') return;
        $ceiling = $this->ceiling($userId);
        if ($ceiling !== null) $this->refuse($ceiling);
    }

    /** A member joined: their cap becomes the ceiling when they have none or a higher one. Never raises a lower cap. */
    public function seed(OrganizationMember $m, Organization $org): void
    {
        if (!config('teams.member_caps_enabled')) return;
        $ceiling = $m->month_cap_units ?? $org->member_month_cap_units;
        if ($ceiling === null) return;
        $this->lowerTo((int) $m->user_id, (int) $ceiling, false);
    }

    /** The team default. Members with their own ceiling are untouched; others are brought down to it, never up. */
    public function setDefault(User $actor, ?float $tokens): Organization
    {
        $a = Teams::authorize($actor, 'set_cap');
        $units = $this->units($tokens);
        return DB::transaction(function () use ($a, $units) {
            $org = Teams::lock($a->organization_id);
            Teams::current($a, 'set_cap');
            $before = $org->member_month_cap_units;
            $org->forceFill(['member_month_cap_units' => $units])->save();
            if ($units !== null) {
                $members = OrganizationMember::query()->where('organization_id', $org->id)->whereNull('month_cap_units')->get();
                foreach ($members as $m) $this->lowerTo((int) $m->user_id, $units, false);
            }
            Audit::record($a->user_id, 'team.cap_changed', $org, null, ['scope' => 'default', 'tokens' => $units === null ? 'off' : Refusal::tokens($units),
                'was' => $before === null ? 'off' : Refusal::tokens((int) $before)]);
            return $org;
        });
    }

    /** One person's ceiling, set by an admin above or below the default; null returns them to the default. Their cap is set to it. */
    public function setMember(User $actor, int $memberId, ?float $tokens): OrganizationMember
    {
        $a = Teams::authorize($actor, 'set_cap');
        $units = $this->units($tokens);
        return DB::transaction(function () use ($a, $memberId, $units) {
            $org = Teams::lock($a->organization_id);
            $target = OrganizationMember::query()->where('organization_id', $org->id)->whereKey($memberId)->first()
                ?? ApiError::throw(404, 'member_not_found', 'That person is not in your team.');
            $actorNow = Teams::current($a, 'set_cap');
            if ($target->user_id !== $actorNow->user_id && !Roles::outranks($actorNow->role, $target->role))
                ApiError::throw(403, 'forbidden', 'Your role cannot change that person\'s limit.');
            $target->forceFill(['month_cap_units' => $units])->save();
            $effective = $units ?? $org->member_month_cap_units;
            if ($effective !== null) $this->lowerTo((int) $target->user_id, (int) $effective, $units !== null);
            Audit::record($actorNow->user_id, 'team.cap_changed', $org, $target->user_id,
                ['scope' => 'member', 'tokens' => $units === null ? 'default' : Refusal::tokens($units)]);
            return $target;
        });
    }

    /** `$exact`: the admin chose this value for the person, so it replaces a lower one; otherwise a lower cap is left alone. */
    private function lowerTo(int $userId, int $units, bool $exact): void
    {
        $user = User::query()->find($userId);
        if (!$user) return;
        $wallet = app(Wallet::class)->ensure($user);
        $w = app(Wallet::class)->lock($userId);
        $cap = $w->cap_month_units;
        if ($cap !== null && (int) $cap === $units) return;
        if ($cap !== null && (int) $cap < $units && !$exact) return;
        DB::table('vibes_wallets')->where('user_id', $userId)->update(['cap_month_units' => $units, 'updated_at' => now()]);
        app(Counters::class)->reset($userId, 'month');
    }

    private function units(?float $tokens): ?int
    {
        if ($tokens === null) return null;
        if ($tokens < 1 || $tokens > (int) config('spend_caps.max_tokens')) ApiError::throw(422, 'invalid_cap', 'Choose between 1 and '.(int) config('spend_caps.max_tokens').' tokens, or switch it off.');
        return (int) round($tokens * Units::SCALE);
    }

    private function refuse(int $ceiling): never
    {
        ApiError::throw(403, 'team_cap', 'Your team limits your monthly spending to '.Refusal::tokens($ceiling).' tokens. You can lower it, but an admin has to raise it.',
            ['limit' => Refusal::tokens($ceiling), 'unit' => 'tokens']);
    }
}
