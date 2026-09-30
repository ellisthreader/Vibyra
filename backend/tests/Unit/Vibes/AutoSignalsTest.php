<?php

namespace Tests\Unit\Vibes;

use App\Services\Vibes\Auto\Demand;
use App\Services\Vibes\Auto\Signals;
use Tests\TestCase;

/**
 * What the router reads off a prompt, before any model is involved. These are the
 * cases that decide whether the rest of it can work at all: a mis-read prompt is
 * routed confidently to the wrong model, and no amount of good scoring recovers it.
 */
class AutoSignalsTest extends TestCase
{
    /**
     * The specific failure of the router this replaces. It matched bare substrings,
     * so `fix ` fired inside "prefix", `test ` inside "latest" and `ui ` inside
     * "gui" - and a prompt about renaming a prefix was routed as agentic coding.
     */
    public function test_a_phrase_inside_a_longer_word_is_not_a_match(): void
    {
        $signals = Signals::of('Add a prefix to the latest gui build so uint values sort first.');

        $this->assertSame(0.0, $signals->difficulty, 'no difficulty phrase occurs in that sentence');
        $this->assertLessThan(0.2, $signals->specialty['frontend'], '"gui" and "uint" are not "ui"');
        $this->assertLessThan(0.2, $signals->specialty['debug'], '"prefix" is not "fix"');
    }

    public function test_a_prefix_entry_reaches_its_whole_family(): void
    {
        foreach (['optimise', 'optimize', 'optimization'] as $word) {
            $this->assertGreaterThan(0.4, Signals::of("Please $word the inner loop.")->difficulty, $word);
        }
    }

    /** A phrase edged with punctuation must not be given a word boundary it cannot have. */
    public function test_punctuation_edged_phrases_still_match(): void
    {
        $this->assertGreaterThan(0.6, Signals::of('tl;dr please')->brevity);
        $this->assertGreaterThan(0.5, Signals::of('Set up the ci/cd pipeline')->specialty['ops']);
        $this->assertGreaterThan(0.4, Signals::of('postgres vs mysql for this')->deliberation);
    }

    /** Evidence combines, but saying the same thing twice is still one reason. */
    public function test_repeating_a_phrase_adds_nothing(): void
    {
        $once = Signals::of('refactor the module')->difficulty;
        $thrice = Signals::of('refactor the module, refactor it again, then refactor once more')->difficulty;

        $this->assertEqualsWithDelta($once, $thrice, 0.0001);
    }

    public function test_a_pasted_file_is_measured_but_not_counted_as_words(): void
    {
        $code = "```\n".str_repeat("const value = compute(input);\n", 40)."```";
        $signals = Signals::of("Have a look at this:\n$code");

        $this->assertGreaterThan(1000, $signals->codeBytes);
        $this->assertLessThan(10, $signals->words, 'the paste is not forty lines of question');
    }

    public function test_paths_constraints_and_enumerated_parts_are_counted(): void
    {
        $signals = Signals::of(<<<'TEXT'
            Update src/app/Main.tsx and lib/util.ts. It must not break the build and
            should never log secrets.
            1. read the file
            2. change the import
            3. run the tests
            TEXT);

        $this->assertSame(2, $signals->paths);
        $this->assertGreaterThanOrEqual(3, $signals->constraints);
        $this->assertSame(3, $signals->steps);
    }

    public function test_a_stack_trace_is_recognised_in_either_language(): void
    {
        $this->assertTrue(Signals::of("Traceback (most recent call last):\n  File \"a.py\", line 3, in <module>")->stackTrace);
        $this->assertTrue(Signals::of("TypeError: undefined is not a function\n    at Board.render (src/Board.tsx:42:18)")->stackTrace);
        $this->assertFalse(Signals::of('How do I read a stack in Rust?')->stackTrace);
    }

    /**
     * The claim the whole design rests on. If these two axes moved together there
     * would be no reason to compute them separately, and the effort chosen would be
     * nothing more than a restatement of the model chosen.
     */
    public function test_capability_and_deliberation_are_genuinely_independent(): void
    {
        $puzzle = Demand::from(Signals::of('why does 0.1 + 0.2 not equal 0.3?'));
        $bulk = Demand::from(Signals::of('reformat every file in src/ to two-space indentation, all 400 of them'));

        $this->assertLessThan(0.38, $puzzle->capability, 'a twelve-word question needs no flagship');
        $this->assertGreaterThan(0.66, $puzzle->deliberation, 'and it needs real thought');
        $this->assertLessThan(0.30, $bulk->deliberation, 'reformatting rewards no thought at all');
        $this->assertGreaterThan(0.60, $bulk->breadth, 'but it does need a window');
    }

    public function test_asking_for_a_short_answer_lowers_deliberation(): void
    {
        $full = Demand::from(Signals::of('why is this test flaky?'))->deliberation;
        $brief = Demand::from(Signals::of('why is this test flaky? one sentence, no explanation'))->deliberation;

        $this->assertGreaterThan($brief, $full);
    }

    public function test_history_raises_breadth_without_raising_deliberation(): void
    {
        $alone = Demand::from(Signals::of('and now add the footer'));
        $deep = Demand::from(Signals::of('and now add the footer', historyBytes: 18000, historyTurns: 10));

        $this->assertGreaterThan($alone->breadth + 0.4, $deep->breadth);
        $this->assertLessThan(0.38, $deep->deliberation, 'a long chat is not a hard question');
    }
}
