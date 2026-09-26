<?php

namespace Tests\Feature\Support;

/**
 * The trial these tests were written against, pinned as a fixture.
 *
 * They measure mechanics — reservation, replay, settlement, refund, the per-chat
 * allowance, the daily budget — none of which depend on how large the shipped
 * trial happens to be. Reading `config/vibes.php` instead made every one of them
 * fail the moment the grant was retuned from 100 Vibes to 3, which says nothing
 * about the mechanics and buries a real regression among fifteen stale numbers.
 *
 * What the shipped trial actually is belongs in one assertion over the config, in
 * `VibesTrialPolicyTest`, so retuning it fails exactly one test that is about it.
 */
trait PinnedVibesTrial
{
    protected function pinTrial(int $credits = 100, int $chats = 2, int $perChat = 50): void
    {
        config(['vibes.trial_credits' => $credits, 'vibes.trial_chats' => $chats,
            'vibes.trial_chat_credits' => $perChat]);
    }
}
