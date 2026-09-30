<?php

namespace Tests\Unit\Vibes;

use App\Services\Vibes\Auto\Ladder;
use Tests\TestCase;

/**
 * Placing a demand on one model's own rungs. Fourteen of the twenty-two curated
 * models publish no ladder at all, and the rest publish between three and six, so
 * every rule here is about not sending a level the provider would reject.
 */
class AutoLadderTest extends TestCase
{
    private const FULL = ['low', 'medium', 'high', 'xhigh', 'max'];
    private const SPARSE = ['low', 'high', 'max'];

    /** No ladder means no `reasoning` key on the request, not a guessed level. */
    public function test_a_model_without_a_ladder_gets_no_effort(): void
    {
        $this->assertNull(Ladder::choose([], 0.0));
        $this->assertNull(Ladder::choose([], 0.99));
    }

    public function test_deliberation_climbs_the_ladder_monotonically(): void
    {
        $seen = [];
        foreach ([0.0, 0.2, 0.35, 0.5, 0.7, 0.83, 0.97] as $deliberation) {
            $seen[] = array_search(Ladder::choose(self::FULL, $deliberation), self::FULL, true);
        }

        for ($i = 1; $i < count($seen); $i++) {
            $this->assertGreaterThanOrEqual($seen[$i - 1], $seen[$i], 'more thought never picks a cheaper rung');
        }
        $this->assertSame('low', Ladder::choose(self::FULL, 0.0));
        $this->assertSame('max', Ladder::choose(self::FULL, 1.0));
    }

    /**
     * The canonical vocabulary is seven rungs and this model offers three, so a
     * demand landing on `medium` has to be placed on a ladder that has no `medium`.
     */
    public function test_a_sparse_ladder_snaps_to_its_nearest_rung(): void
    {
        $this->assertSame('low', Ladder::choose(self::SPARSE, 0.10));
        $this->assertSame('high', Ladder::choose(self::SPARSE, 0.70));
        $this->assertSame('max', Ladder::choose(self::SPARSE, 0.99));
    }

    /** A tie means the evidence did not separate them, so it is not charged for. */
    public function test_a_tie_settles_on_the_cheaper_rung(): void
    {
        // 'medium' sits exactly between 'low' and 'high' on the canonical ladder.
        $this->assertSame('low', Ladder::choose(['low', 'high'], 0.5));
    }

    /** A model that cannot be switched off never publishes 'none', so nor do we. */
    public function test_a_mandatory_reasoner_is_never_sent_none(): void
    {
        $this->assertSame('low', Ladder::choose(['low', 'medium', 'high'], 0.0));
    }

    public function test_stepping_down_walks_the_model_s_own_rungs(): void
    {
        $this->assertSame('high', Ladder::cheaper(self::FULL, 'xhigh'));
        $this->assertSame('low', Ladder::cheaper(self::SPARSE, 'high'));
        $this->assertNull(Ladder::cheaper(self::FULL, 'low'), 'nothing below the bottom rung');
        $this->assertNull(Ladder::cheaper(self::FULL, null));
    }

    /** A ladder arriving out of order, or carrying a word we do not know, is repaired. */
    public function test_rungs_are_ordered_and_unknown_levels_dropped(): void
    {
        $this->assertSame(['low', 'high', 'max'], Ladder::ordered(['max', 'low', 'high']));
        $this->assertSame(['low', 'high'], Ladder::ordered(['high', 'ultrathink', 'low']));
    }
}
