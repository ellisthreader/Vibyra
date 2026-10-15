<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** One "Download my data" request. The archive lives on the export disk under `path`; no link is ever stored. */
final class AccountExport extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['requested_at' => 'datetime', 'ready_at' => 'datetime', 'expires_at' => 'datetime', 'bytes' => 'integer'];
    }
}
