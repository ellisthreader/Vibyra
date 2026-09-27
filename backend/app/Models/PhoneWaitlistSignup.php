<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'email',
    'source',
    'notified_at',
])]
class PhoneWaitlistSignup extends Model
{
    public const SOURCE_MARKETING_HOME = 'marketing-home';

    protected function casts(): array
    {
        return ['notified_at' => 'datetime'];
    }
}
