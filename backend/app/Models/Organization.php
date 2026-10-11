<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** A team. Nothing is mass-assignable: services write with forceFill/forceCreate so a request body can never set a column. */
final class Organization extends Model
{
    use HasUuids;

    protected $guarded = ['*'];

    protected function casts(): array
    {
        return ['seats' => 'integer', 'member_month_cap_units' => 'integer'];
    }
}
