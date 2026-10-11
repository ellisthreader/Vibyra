<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationInvitation, OrganizationMember, OrganizationSso, User};
use App\Services\Spend\Refusal;

/** What the portal's Team page shows. Emails and open invitations are for admins and owners; a member sees names and roles. */
final class Overview
{
    public function for(User $user): array
    {
        $m = OrganizationMember::query()->where('user_id', $user->id)->first();
        if (!$m) return ['ok' => true, 'team' => null, 'canCreate' => Teams::mayCreate($user)];
        $org = Organization::query()->findOrFail($m->organization_id);
        $admin = Roles::can($m->role, 'set_cap');
        $seats = app(Seats::class);
        $ceiling = app(MemberCaps::class)->ceiling($user->id);
        $can = array_values(array_filter(Roles::allowed($m->role), fn ($action) => $action !== 'set_cap' || config('teams.member_caps_enabled')));
        return ['ok' => true, 'canCreate' => false, 'role' => $m->role, 'can' => $can,
            'team' => ['id' => $org->id, 'name' => $org->name, 'seats' => $org->seats, 'seatsUsed' => $seats->members($org),
                'seatsHeld' => $seats->pending($org), 'defaultMonthCapTokens' => $this->tokens($org->member_month_cap_units)],
            'you' => ['memberId' => $m->id, 'monthCapCeilingTokens' => $this->tokens($ceiling)],
            'members' => $this->members($org, $user, $admin),
            'invitations' => $admin ? $this->invitations($org) : [],
            'sso' => $m->role === Roles::OWNER ? app(Sso\Settings::class)->payload($org) : ['visible' => false]];
    }

    private function members(Organization $org, User $viewer, bool $admin): array
    {
        $rows = OrganizationMember::query()->with('user:id,name,email')->where('organization_id', $org->id)->orderBy('id')->get();
        $order = [Roles::OWNER => 0, Roles::ADMIN => 1, Roles::MEMBER => 2];
        return $rows->sortBy(fn ($r) => $order[$r->role] * 1_000_000 + $r->id)->map(fn (OrganizationMember $r) => [
            'id' => $r->id, 'name' => $r->user?->name, 'email' => $admin || $r->user_id === $viewer->id ? $r->user?->email : null,
            'role' => $r->role, 'you' => $r->user_id === $viewer->id, 'via' => $r->joined_via,
            'monthCapTokens' => $admin ? $this->tokens($r->month_cap_units) : null, 'joinedAt' => $r->created_at?->toIso8601String(),
        ])->values()->all();
    }

    private function invitations(Organization $org): array
    {
        return OrganizationInvitation::query()->where('organization_id', $org->id)->whereNull('accepted_at')->whereNull('revoked_at')
            ->where('expires_at', '>', now())->orderByDesc('created_at')->limit(100)->get()
            ->map(fn ($i) => ['id' => $i->id, 'email' => $i->email, 'role' => $i->role, 'expiresAt' => $i->expires_at->toIso8601String()])->all();
    }

    private function tokens(?int $units): float|int|null
    {
        return $units === null ? null : Refusal::tokens($units);
    }
}
