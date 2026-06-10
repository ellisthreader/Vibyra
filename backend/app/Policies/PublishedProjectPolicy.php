<?php

namespace App\Policies;

use App\Models\PublishedProject;
use App\Models\User;
use App\Services\Auth\PrivilegedRoleService;

class PublishedProjectPolicy
{
    public function __construct(
        private readonly PrivilegedRoleService $roles,
    ) {}

    public function reviewAny(User $user): bool
    {
        return $this->roles->canReviewPublishedProjects($user);
    }

    public function review(User $user, PublishedProject $project): bool
    {
        return $this->reviewAny($user);
    }
}
