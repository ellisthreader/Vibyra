<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\Wake;
use App\Services\CloudWorkspaces\{CloudWorkspaceProvider, Lifecycle, ProviderReview};

/** A start that only an operator can fix stops at once with a sentence the phone shows, not three minutes later. */
class ComputerStartReviewTest extends ComputerTestCase
{
    public function test_a_start_needing_operator_review_stops_at_once_and_says_so(): void
    {
        $this->createComputer();
        $this->app->instance(CloudWorkspaceProvider::class, new class implements CloudWorkspaceProvider {
            public function configure(object $w): array { throw new ProviderReview('Multiple project disks need reconciliation.'); }
            public function recover(object $w): ?array { return null; }
            public function inspect(object $w): string { return 'absent'; }
            public function stop(object $w): void {}
            public function destroy(object $w): void {}
        });
        $this->wake()->assertStatus(202);
        app(Lifecycle::class)->reconcile($this->cid); // the wake's own reconcile, should the queue not have run it
        $this->assertSame(['stopped', 'provider_review'], [$this->row()->state, $this->row()->stop_reason]);
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('computer.state', 'error')
            ->assertJsonPath('computer.error', 'Vibyra Cloud couldn’t start: its storage needs a check by Vibyra. Your projects are safe on your Mac.');
        // Automatic sync wakes leave it alone for a while; the person's own Sync again does not wait.
        $generation = $this->row()->generation;
        app(Wake::class)->forSync($this->user->id);
        $this->assertSame($generation, $this->row()->generation);
        app(Wake::class)->forSync($this->user->id, true);
        $this->assertGreaterThan($generation, $this->row()->generation);
    }
}
