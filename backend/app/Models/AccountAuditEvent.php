<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/** One line of a person's account activity. Append-only: never updated, never deleted by code. */
final class AccountAuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['detail' => 'array', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Account activity is append-only.'));
        static::deleting(fn () => throw new LogicException('Account activity is append-only.'));
    }
}
