<?php

namespace Tests\Unit;

use App\Models\ChatCostReservation;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Tests\TestCase;

class ChatCostReservationModelTest extends TestCase
{
    public function test_exposes_expected_statuses_and_fillable_attributes(): void
    {
        $reservation = new ChatCostReservation();

        $this->assertSame([
            'pending',
            'settling',
            'settled',
            'released',
            'expired',
        ], ChatCostReservation::STATUSES);

        $this->assertSame([
            'user_id',
            'reference',
            'status',
            'model_key',
            'model_slug',
            'reserved_credits',
            'reserved_micro_usd',
            'actual_credits',
            'actual_micro_usd',
            'input_tokens',
            'output_tokens',
            'attempts',
            'meta',
            'expires_at',
            'provider_started_at',
            'settled_at',
            'released_at',
            'release_reason',
        ], $reservation->getFillable());
    }

    public function test_casts_cost_usage_attempts_and_timestamps(): void
    {
        $reservation = new ChatCostReservation();
        $casts = $reservation->getCasts();

        $this->assertSame('integer', $casts['reserved_credits']);
        $this->assertSame('integer', $casts['reserved_micro_usd']);
        $this->assertSame('integer', $casts['actual_credits']);
        $this->assertSame('integer', $casts['actual_micro_usd']);
        $this->assertSame('integer', $casts['input_tokens']);
        $this->assertSame('integer', $casts['output_tokens']);
        $this->assertSame('array', $casts['attempts']);
        $this->assertSame('array', $casts['meta']);
        $this->assertSame('datetime', $casts['expires_at']);
        $this->assertSame('datetime', $casts['provider_started_at']);
        $this->assertSame('datetime', $casts['settled_at']);
        $this->assertSame('datetime', $casts['released_at']);
    }

    public function test_belongs_to_a_user(): void
    {
        $relation = (new ChatCostReservation())->user();

        $this->assertInstanceOf(BelongsTo::class, $relation);
        $this->assertInstanceOf(User::class, $relation->getRelated());
        $this->assertSame('user_id', $relation->getForeignKeyName());
    }
}
