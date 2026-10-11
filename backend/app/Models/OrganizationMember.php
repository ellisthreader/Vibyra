<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One account's seat in one organization (an account belongs to at most one). Roles: owner, admin, member. */
final class OrganizationMember extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['month_cap_units' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
