<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\{CloudWorkspaceProvider, FlyProvider, Lifecycle, ProviderReview, Shutdown};
use Illuminate\Http\Client\{ConnectionException, Factory};
use Illuminate\Support\Facades\{DB, Http};

/** Provider grace is distinct from HTTP reply timeout and from a stopped-machine receipt. */
class FlyStopBudgetTest extends ComputerTestCase
{
    private const IMAGE = 'registry.test/runtime@sha256:'.'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private function requested(string $reason = 'user_stop'): object
    {
        config(['cloud_workspaces.orderly_stop_images' => [self::IMAGE]]);
        $this->computerReady();
        return app(Shutdown::class)->request($this->user->id, $this->cid, $reason);
    }

    private function machine(object $w, string $state = 'started'): array
    {
        return ['id' => $w->machine_id, 'state' => $state, 'image_ref' => ['digest' => 'sha256:'.str_repeat('a', 64)], 'config' => ['image' => self::IMAGE, 'metadata' => [
            'vibyra_workspace' => $w->id, 'vibyra_operation' => $w->operation_id,
            'vibyra_generation' => (string) $w->generation]]];
    }

    private function mockMachine(array $machine): void
    {
        Http::swap(new Factory());
        Http::fake(fn ($r) => Http::response(str_ends_with($r->url(), '/stop') ? [] : $machine));
    }

    public function test_ordinary_current_computer_stop_allows_the_runtime_budget_without_extending_http_wait(): void
    {
        $w = $this->requested();
        foreach (['user_stop', 'idle'] as $reason) {
            $w->stop_reason = $reason; $optionsSeen = null;
            Http::swap(new Factory());
            Http::fake(function ($r, $options) use ($w, &$optionsSeen) {
                if (str_ends_with($r->url(), '/stop')) $optionsSeen = $options;
                return Http::response(str_ends_with($r->url(), '/stop') ? [] : $this->machine($w));
            });
            app(FlyProvider::class)->stop($w);
            Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop')
                && $r['signal'] === 'SIGTERM' && $r['timeout'] === '40s');
            $this->assertSame(12, $optionsSeen['timeout']);
            $this->assertSame(5, $optionsSeen['connect_timeout']);
            $this->assertSame('stopping', $this->row()->state, 'Accepted stop is not confirmed shutdown.');
        }
    }

    public function test_only_actual_reviewed_immutable_images_get_extended_grace(): void
    {
        $w = $this->requested(); $good = $this->machine($w); $old = 'registry.test/runtime@sha256:'.str_repeat('b', 64);
        config(['cloud_workspaces.image' => self::IMAGE]); // Current default never proves an existing VM's image.
        $cases = [
            'default old actual' => [['image' => $old], null, [self::IMAGE], '10s'],
            'empty allowlist' => [['image' => self::IMAGE], null, [], '10s'],
            'mutable tag even with digest' => [['image' => 'registry.test/runtime:latest'], ['digest' => 'sha256:'.str_repeat('a', 64)], [self::IMAGE], '10s'],
            'conflicting actual digest' => [['image' => self::IMAGE], ['digest' => 'sha256:'.str_repeat('b', 64)], [self::IMAGE], '10s'],
            'immutable config only' => [['image' => self::IMAGE], null, [self::IMAGE], '10s'],
            'actual digest only' => [[], ['digest' => 'sha256:'.str_repeat('a', 64)], [self::IMAGE], '40s'],
            'matching both' => [['image' => self::IMAGE], ['digest' => 'sha256:'.str_repeat('a', 64)], [self::IMAGE], '40s'],
            'missing both' => [[], null, [self::IMAGE], '10s'],
            'malformed digest' => [[], ['digest' => 'unknown'], [self::IMAGE], '10s'],
            'tag in allowlist' => [['image' => 'registry.test/runtime:latest'], null, ['registry.test/runtime:latest'], '10s'],
        ];
        foreach ($cases as $label => [$image, $ref, $allowed, $expected]) {
            config(['cloud_workspaces.orderly_stop_images' => $allowed]);
            $m = $good; $m['config'] = $image + ['metadata' => $good['config']['metadata']];
            unset($m['image_ref']); if ($ref !== null) $m['image_ref'] = $ref;
            $this->mockMachine($m); app(FlyProvider::class)->stop($w);
            $requests = Http::recorded(fn ($r) => str_ends_with($r->url(), '/stop'));
            $this->assertCount(1, $requests, $label);
            $this->assertSame($expected, $requests->first()[0]['timeout'], $label);
        }
        config(['cloud_workspaces.image' => $old, 'cloud_workspaces.orderly_stop_images' => [self::IMAGE]]);
        $this->mockMachine($good); app(FlyProvider::class)->stop($w);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '40s');
    }

    public function test_unresolved_machine_states_never_receive_extended_grace_or_confirm_absence(): void
    {
        $w = $this->requested();
        foreach (['starting', 'created', 'replacing', 'unknown', null] as $state) {
            $m = $this->machine($w); $m['state'] = $state;
            if ($state === null) unset($m['state']);
            $this->mockMachine($m);
            $this->assertSame($state ?? 'unknown', app(FlyProvider::class)->inspect($w));
            app(FlyProvider::class)->stop($w);
            Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '10s');
        }
    }

    public function test_emergency_and_unknown_reasons_keep_the_ten_second_provider_kill(): void
    {
        $w = $this->requested();
        foreach (['compute_lease_expired', 'authority_revoked', 'account_deletion', 'entitlement_or_payment',
            'budget_or_balance', 'allowance_exhausted', 'network_limit', 'deadline', 'boot_timeout', 'provider_review', null, 'future_reason'] as $reason) {
            $w->stop_reason = $reason; $this->mockMachine($this->machine($w));
            app(FlyProvider::class)->stop($w);
            Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '10s');
        }
    }

    public function test_incomplete_intent_legacy_project_and_recovery_do_not_receive_extended_grace(): void
    {
        $w = $this->requested();
        foreach (['ready_at' => null, 'stop_requested_at' => null, 'kind' => 'project', 'state' => 'recovery_required'] as $key => $value) {
            $changed = (object) array_merge((array) $w, [$key => $value]);
            $this->mockMachine($this->machine($changed)); app(FlyProvider::class)->stop($changed);
            Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '10s');
        }
    }

    public function test_an_orderly_provider_stop_in_progress_is_not_reissued_but_emergency_can_shorten_it(): void
    {
        $w = $this->requested(); $this->mockMachine($this->machine($w, 'stopping'));
        app(FlyProvider::class)->stop($w);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
        $w->stop_reason = 'authority_revoked';
        app(FlyProvider::class)->stop($w);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '10s');
    }

    public function test_audit_containment_keeps_ten_seconds_even_for_an_orderly_workspace(): void
    {
        $w = $this->requested();
        foreach (['started', 'stopping'] as $state) {
            $m = $this->machine($w, $state);
            $m['config']['metadata']['vibyra_operation'] = 'old-operation';
            $m['config']['metadata']['vibyra_generation'] = '0';
            $this->mockMachine($m); app(FlyProvider::class)->stopResource($w, $m);
            Http::assertSent(fn ($r) => str_ends_with($r->url(), '/stop') && $r['timeout'] === '10s');
        }
    }

    public function test_stale_or_foreign_metadata_never_gets_an_orderly_stop_request(): void
    {
        $w = $this->requested();
        foreach (['vibyra_workspace', 'vibyra_operation', 'vibyra_generation'] as $field) {
            $m = $this->machine($w); $m['config']['metadata'][$field] = 'not-current';
            $this->mockMachine($m);
            try { app(FlyProvider::class)->stop($w); $this->fail('Unverified machine cannot be stopped as current.'); }
            catch (ProviderReview $e) { $this->assertStringContainsString('ownership', $e->getMessage()); }
            Http::assertNotSent(fn ($r) => $r->method() === 'POST');
        }
        $this->mockMachine([]);
        try { app(FlyProvider::class)->stop($w); $this->fail('Empty provider response has no ownership proof.'); }
        catch (ProviderReview $e) { $this->assertStringContainsString('ownership', $e->getMessage()); }
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_terminal_provider_states_are_never_stopped_again(): void
    {
        $w = $this->requested();
        foreach (['stopped', 'destroyed'] as $state) {
            $this->mockMachine($this->machine($w, $state)); app(FlyProvider::class)->stop($w);
            Http::assertNotSent(fn ($r) => $r->method() === 'POST');
        }
        Http::swap(new Factory()); Http::fake(fn () => Http::response([], 404));
        app(FlyProvider::class)->stop($w);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }

    public function test_unknown_http_stop_is_reconciled_without_repeating_or_prematurely_confirming(): void
    {
        $w = $this->requested(); $this->travel(46)->seconds();
        $this->app->bind(CloudWorkspaceProvider::class, FlyProvider::class);
        $state = 'started'; $stops = 0;
        Http::swap(new Factory());
        Http::fake(function ($r) use ($w, &$state, &$stops) {
            if (str_ends_with($r->url(), '/stop')) {
                $stops++; $state = 'stopping';
                throw new ConnectionException('Synthetic lost reply');
            }
            return Http::response($this->machine($w, $state));
        });
        try { app(Lifecycle::class)->reconcile($w->id); $this->fail('Lost reply remains unknown.'); }
        catch (\RuntimeException $e) { $this->assertSame('Cloud resource reconciliation needs retry or operator review.', $e->getMessage()); }
        $this->assertSame('stopping', $this->row()->state);
        $this->assertNotNull($this->row()->runtime_token_hash);
        app(Lifecycle::class)->reconcile($w->id);
        $this->assertSame(1, $stops); $this->assertSame('stopping', $this->row()->state);
        $state = 'stopped'; app(Lifecycle::class)->reconcile($w->id);
        $this->assertSame(1, $stops); $this->assertSame('stopped', $this->row()->state);
        $this->assertNull($this->row()->runtime_token_hash);
    }
}
