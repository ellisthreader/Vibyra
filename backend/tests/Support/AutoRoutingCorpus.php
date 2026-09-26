<?php

namespace Tests\Support;

/**
 * Prompts with the band each belongs in, and the criteria the bands mean. Two axes
 * are labelled, because the router keeps them apart and the whole claim is that
 * they are different questions - several entries below are deliberately loud on one
 * and silent on the other, because a router that scores those alike is the one this
 * corpus exists to rule out.
 *
 * capability - could the cheapest model in the catalogue be trusted with this?
 *   low   yes: the answer is short, known, or mechanical
 *   mid   no: it would be sloppy or partly wrong, and a mid-tier model would not
 *   high  only a flagship should be trusted with it
 *
 * deliberation - how often is a competent model's first answer already right?
 *   low   nearly always: the question fixes the answer
 *   mid   often, but checking assumptions materially improves it
 *   high  frequently not: a first pass is a guess and a second pass corrects it
 *
 * The first labelling was written before any of it was measured. Where measurement
 * disagreed, each label was re-read against the criterion above and changed only
 * where the criterion said the original was wrong - `scaffold an express server`
 * down to low capability because the cheapest model does write that correctly,
 * `why is my test flaky` up to mid because it does not, and `optimise this
 * function` up to high for the reason noted beside it. Bands overlap at the edges
 * on purpose: these are fuzzy quantities and a boundary to four decimal places
 * would be a claim the method cannot support.
 */
final class AutoRoutingCorpus
{
    public const BANDS = ['low' => [0.00, 0.38], 'mid' => [0.32, 0.72], 'high' => [0.66, 1.00]];

    /** @return list<array{prompt: string, c: string, d: string}> */
    public static function all(): array
    {
        return array_merge(self::settled(), self::thinkers(), self::everyday(), self::hard(), self::wide());
    }

    /** The question fixes the answer. Cheapest model, no thinking. */
    private static function settled(): array
    {
        return self::band('low', 'low', [
            'what is the git command to undo the last commit?',
            'rename the variable foo to bar in this file',
            'add a docstring to this function',
            'tl;dr of what a websocket is',
            'convert this JSON to YAML',
            'fix the typo in the readme',
            'what does the -f flag do in curl?',
            'write a haiku about recursion',
            'reformat this file with two-space indentation',
            'what is the syntax for a python list comprehension?',
            'give me a list of HTTP status codes',
            'bump the version to 2.1.0 in package.json',
            'briefly, what is a mutex?',
            'add a comment explaining what this line does',
            'proofread this paragraph for spelling',
            'in one sentence, what is a monad?',
            'draft a short email telling the team the launch slipped a week',
            'scaffold an express server with a health endpoint',
            'convert this class component to a function component',
        ]);
    }

    /** Small questions whose first answer is usually wrong. */
    private static function thinkers(): array
    {
        return array_merge(
            self::band('low', 'high', [
                'why does 0.1 + 0.2 not equal 0.3?',
                'why did this work yesterday and not today?',
                'explain why quicksort is O(n log n) on average but O(n squared) in the worst case',
                'is it ever correct to compare floats with equality? think it through',
            ]),
            self::band('mid', 'high', [
                'why is my test flaky? it only fails on CI',
                'should I use a queue or a cron job here? walk me through the trade-offs',
                'what happens if two requests hit this endpoint at exactly the same time?',
                'compare postgres and mysql for a write-heavy workload and recommend one',
                'our users report the app freezes when they upload a large file. investigate.',
            ]),
        );
    }

    /** Real work of unremarkable size. */
    private static function everyday(): array
    {
        return array_merge(
            self::band('mid', 'low', [
                'implement a debounce function in typescript',
                'write a unit test for this validation function',
                'add a loading spinner to this react component',
                'add pagination to this API endpoint and update the tests',
                'write a dockerfile for a node app with a multi-stage build',
                'translate this python function to rust',
                'add dark mode to the settings screen',
            ]),
            self::band('mid', 'mid', [
                'refactor this component to use hooks instead of lifecycle methods',
                'the deploy fails with a permission error from the docker build, how do I fix it?',
                'make this form accessible and keyboard navigable',
            ]),
            // Hot-path performance is where a cheap model reliably produces advice
            // that sounds right and misses the actual bottleneck, so this is a
            // flagship's job even though the prompt is one line long.
            // Why a query plan changed is a question whose first answer is usually a
            // guess about the optimiser, which is the definition of the top band.
            self::band('mid', 'high', [
                'work out why this SQL query got slow after we added the index',
            ]),
            self::band('high', 'mid', [
                'optimise this function, it is the bottleneck in our hot path',
            ]),
        );
    }

    /** Genuinely hard, and the thinking is most of the work. */
    private static function hard(): array
    {
        return self::band('high', 'high', [
            'design a distributed rate limiter that stays correct when a node dies mid-window',
            'we have a race condition somewhere in the payment settlement path. find the root cause '
                .'and explain why it only shows up under load. it must not lose a settlement and must stay idempotent.',
            'do a security review of this authentication flow and threat model the session handling',
            'architect a multi-tenant permission system with row-level isolation. it must support '
                .'delegated admin, must never leak across tenants, and should not need a migration to add a role.',
            'our eventual consistency model is causing duplicate charges. prove which ordering '
                .'guarantees we actually need and design the fix.',
            'the parser deadlocks on nested inputs. diagnose the concurrency bug and propose a thread-safe rewrite.',
        ]);
    }

    /** A lot to hold at once, which is not the same as a lot to think about. */
    private static function wide(): array
    {
        return array_merge(
            self::band('mid', 'low', [
                'go through every file in src/ and reformat the imports to be alphabetical',
                'rename UserService to AccountService across the whole project',
            ]),
            self::band('high', 'high', [
                'audit the entire codebase for places we still call the deprecated auth API, '
                    .'work out which are safe to migrate automatically and which need a decision, '
                    .'and explain the risk in each case.',
            ]),
        );
    }

    private static function band(string $c, string $d, array $prompts): array
    {
        return array_map(static fn (string $prompt) => ['prompt' => $prompt, 'c' => $c, 'd' => $d], $prompts);
    }

    public static function within(string $band, float $value): bool
    {
        [$low, $high] = self::BANDS[$band];

        return $value >= $low && $value <= $high;
    }
}
