<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/** A killed run must not keep a Cloud job from running for the default 24 h. */
class CloudScheduleLocksTest extends TestCase
{
    public function test_cloud_jobs_that_gate_starts_release_their_overlap_lock_quickly(): void
    {
        foreach (['vibyra:cloud-workspaces', 'vibyra:cloud-provider-audit'] as $command) {
            $events = collect(app(Schedule::class)->events())->filter(fn ($e) => str_contains((string) $e->command, $command));
            $this->assertCount(1, $events, $command);
            $this->assertLessThanOrEqual(5, $events->first()->expiresAt, "$command overlap lock minutes");
        }
    }
}
