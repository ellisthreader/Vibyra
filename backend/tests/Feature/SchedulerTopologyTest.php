<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

class SchedulerTopologyTest extends TestCase
{
    public function test_every_scheduled_task_is_single_server_with_an_explicit_lock_lifetime(): void
    {
        $expected = [
            'vibyra:refresh-credits' => 120,
            'vibyra:sync-openrouter-pricing' => 55,
            'vibyra:recover-chat-cost-reservations' => 4,
            'maxmind:update' => 120,
            'vibyra:deploy-runtime-demos' => 30,
            'vibyra:cleanup-runtime-demos' => 10,
        ];
        $events = app(Schedule::class)->events();

        foreach ($expected as $command => $lockMinutes) {
            $event = collect($events)->first(
                fn ($candidate) => str_contains((string) $candidate->command, $command)
            );

            $this->assertNotNull($event, "The {$command} schedule is missing.");
            $this->assertTrue($event->onOneServer, "The {$command} schedule must run on one server.");
            $this->assertTrue($event->withoutOverlapping, "The {$command} schedule must prevent overlap.");
            $this->assertSame($lockMinutes, $event->expiresAt, "The {$command} lock lifetime changed.");
        }
    }
}
