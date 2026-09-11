<?php

namespace Tests\Support;

/**
 * A second corpus, written after the router was tuned and deliberately not used to
 * tune it. It exists because a hundred per cent on the set you fitted to is not a
 * measurement of anything - it is a description of the fitting. These prompts were
 * labelled against the criteria in `AutoRoutingCorpus` and run once.
 *
 * Keep it that way. If a change makes this corpus fail, the honest options are to
 * fix the router or to argue the label is wrong on the criteria; quietly relabelling
 * to restore a number turns the only independent evidence here back into the other
 * kind. The threshold is set below the first measured score so the suite reports a
 * real regression rather than tracking noise.
 */
final class AutoRoutingHeldOut
{
    /** @return list<array{prompt: string, c: string, d: string}> */
    public static function all(): array
    {
        return array_merge(
            self::band('low', 'low', [
                'what port does postgres listen on by default?',
                'make this text bold in markdown',
                'generate a uuid in python',
                'add a .gitignore for a node project',
                'shorten this commit message',
                'write release notes for version 3.2',
                'rewrite this paragraph to be friendlier',
                'what is 17 times 23?',
                'translate this readme into french',
                'set up eslint and prettier for this repo',
            ]),
            // Both were labelled low on the first pass and corrected on the criteria,
            // not on the score. A callback-to-async conversion looks mechanical and
            // routinely changes error semantics, so the cheapest model cannot be
            // trusted with it. The second is a genuine limit rather than a fix: the
            // router cannot tell a teaching question about a known phenomenon from a
            // diagnosis of an unknown one, and reads the pair alike.
            self::band('mid', 'low', [
                'convert these callbacks to async await',
            ]),
            self::band('mid', 'high', [
                'explain why this recursive function overflows the stack',
            ]),
            self::band('low', 'mid', [
                'explain this regex to me: ^(?=.*[A-Z]).{8,}$',
            ]),
            self::band('mid', 'low', [
                'add a retry with exponential backoff to this http client',
                'write a react hook that debounces a search input',
                'add validation to this form so email is required',
                'add a dark mode toggle that remembers the choice',
                'summarise what every file in this directory does',
                'find all the places we hardcode the api url across the repo',
            ]),
            self::band('mid', 'high', [
                'why would this promise never resolve?',
                'our nightly job silently skipped one day last week. why?',
                'is it safe to run this migration while the app is live?',
                'the CI job passes locally but fails on the runner. what should I check?',
                'our memory usage grows until the pod is OOM killed. investigate.',
                'should we use server components here? think through the trade-offs',
            ]),
            self::band('high', 'high', [
                'design an offline-first sync engine that resolves conflicts deterministically',
                'we are seeing duplicate webhook deliveries charge customers twice. find the root '
                    .'cause and make the handler idempotent.',
                'review this JWT implementation for vulnerabilities',
                'plan a zero-downtime migration from a single database to sharded tenants',
            ]),
        );
    }

    private static function band(string $c, string $d, array $prompts): array
    {
        return array_map(static fn (string $prompt) => ['prompt' => $prompt, 'c' => $c, 'd' => $d], $prompts);
    }
}
