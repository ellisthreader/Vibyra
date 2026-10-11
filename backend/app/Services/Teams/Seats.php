<?php

namespace App\Services\Teams;

use App\Models\{Organization, OrganizationInvitation, OrganizationMember};
use App\Services\AgentRuns\ApiError;

/**
 * Seats. `organizations.seats` is the number of people the team may seat: null while the team has no seat plan (Teams is not sold
 * yet, so unlimited up to `teams.max_members`), a number once a Team subscription sets it (see SeatBilling). A pending invitation
 * holds a seat so an admin cannot invite past the plan. Callers hold the organization lock.
 */
final class Seats
{
    public function members(Organization $org): int
    {
        return OrganizationMember::query()->where('organization_id', $org->id)->count();
    }

    public function pending(Organization $org): int
    {
        return OrganizationInvitation::query()->where('organization_id', $org->id)->whereNull('accepted_at')->whereNull('revoked_at')
            ->where('expires_at', '>', now())->count();
    }

    public function limit(Organization $org): int
    {
        return min((int) config('teams.max_members'), $org->seats ?? PHP_INT_MAX);
    }

    /** Refuse an invitation when members plus open invitations already fill the seats. */
    public function assertRoomToInvite(Organization $org): void
    {
        if ($this->members($org) + $this->pending($org) >= $this->limit($org))
            ApiError::throw(409, 'no_seats', 'Every seat is taken. Add seats or revoke an invitation first.');
    }

    /** Accepting turns the invitation itself into the seat, so only members are counted. */
    public function assertRoomToJoin(Organization $org): void
    {
        if ($this->members($org) >= $this->limit($org)) ApiError::throw(409, 'no_seats', 'This team has no free seat.');
    }
}
