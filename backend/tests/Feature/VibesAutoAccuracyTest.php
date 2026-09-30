<?php

namespace Tests\Feature;

use App\Services\Vibes\Auto\Router;
use App\Services\Vibes\Auto\Situation;
use Tests\Support\AutoRoutingCorpus;
use Tests\Support\AutoRoutingHeldOut;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

/**
 * How often the router reads a prompt the way a person would. Two corpora, because
 * one of them is not evidence: `AutoRoutingCorpus` is the set the weights were tuned
 * against and scoring well on it only says the tuning worked, while
 * `AutoRoutingHeldOut` was written afterwards and run once. The gap between the two
 * is the honest measurement, and on the first run it was large - 100% against 77.6%
 * - which is what sent the missing vocabulary back into `Lexicon` rather than
 * letting a fitted number stand as an accuracy claim.
 *
 * The thresholds sit below both current scores on purpose. A suite pinned to the
 * exact number would fail on any relabel and teach the next person to relax it;
 * these fail only when several prompts move, which is a regression worth reading.
 */
class VibesAutoAccuracyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        VibesCatalogue::put();
    }

    public function test_the_tuned_corpus_is_read_correctly(): void
    {
        $this->assertAccuracy(AutoRoutingCorpus::all(), 0.97, 'tuned');
    }

    public function test_the_held_out_corpus_is_read_correctly(): void
    {
        $this->assertAccuracy(AutoRoutingHeldOut::all(), 0.93, 'held out');
    }

    /**
     * Both axes of every prompt, scored against the band it was labelled with. The
     * misses are reported in full rather than counted, because "89% pass" tells the
     * next person nothing about which prompts to argue with.
     */
    private function assertAccuracy(array $corpus, float $threshold, string $name): void
    {
        $router = app(Router::class);
        $situation = Situation::of(1200, 50, false, false, 0, 0);
        $total = 0;
        $missed = [];

        foreach ($corpus as $case) {
            $demand = $router->demand($case['prompt'], $situation);
            foreach (['c' => $demand->capability, 'd' => $demand->deliberation] as $axis => $value) {
                $total++;
                if (! AutoRoutingCorpus::within($case[$axis], $value)) {
                    $missed[] = sprintf('%s=%.2f wanted %s | %s',
                        $axis === 'c' ? 'capability' : 'deliberation', $value, $case[$axis], $case['prompt']);
                }
            }
        }

        $accuracy = ($total - count($missed)) / $total;
        $this->assertGreaterThanOrEqual($threshold, $accuracy, sprintf(
            "%s corpus read %.1f%% of %d band assertions correctly, below the %.0f%% threshold.\n%s",
            $name, $accuracy * 100, $total, $threshold * 100, implode("\n", $missed),
        ));
    }
}
