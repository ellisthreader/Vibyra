<?php

namespace Tests\Support;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Lifecycle;
use App\Services\Mcp\EndpointPolicy;
use App\Services\Platform\WebhookEndpoints;

/** Shared setup for the outbound webhook tests (roadmap Part 11): a public-looking address, endpoints and runs to move. */
trait PlatformWebhookFixture
{
    private const URL = 'https://hooks.example.test/vibyra';
    private array $lookup = ['93.184.216.34'];

    protected function bootWebhooks(): void
    {
        $this->bootV2();
        config(['platform.webhooks' => true, 'platform.activity' => true]);
        $this->app->instance(EndpointPolicy::class, new EndpointPolicy(fn () => $this->lookup));
    }

    private function endpoint(array $events = WebhookEndpoints::EVENTS, string $url = self::URL): array
    {
        return app(WebhookEndpoints::class)->create($this->user->id, $url, $events);
    }

    private function newRun(): Run
    {
        return Run::query()->findOrFail($this->admit('Secret prompt about acme-merger.pdf')['id']);
    }

    private function move(Run $run, string ...$states): void
    {
        foreach ($states as $state) app(Lifecycle::class)->move($run, $state);
    }
}
