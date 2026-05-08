<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'kind',
    'model_key',
    'model_slug',
    'openrouter_micro_usd',
    'input_tokens',
    'output_tokens',
    'multiplier_x100',
    'credits_delta',
    'credits_balance_after',
    'reference',
    'meta',
])]
class CreditLedger extends Model
{
    protected $table = 'credit_ledger';

    protected function casts(): array
    {
        return [
            'meta' => 'array',
            'openrouter_micro_usd' => 'integer',
            'input_tokens' => 'integer',
            'output_tokens' => 'integer',
            'multiplier_x100' => 'integer',
            'credits_delta' => 'integer',
            'credits_balance_after' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
