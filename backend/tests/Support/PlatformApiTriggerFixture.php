<?php

namespace Tests\Support;

trait PlatformApiTriggerFixture
{
    protected function makeTrigger(string $kind, array $filter, array $extra = []): array
    {
        $response = $this->postJson('/api/agents/v2/triggers', [...[
            'agentId' => $this->agent['id'], 'kind' => $kind, 'filter' => $filter,
            'promptTemplate' => 'Handle this.'], ...$extra])->assertCreated();
        return [...$response->json('trigger'), 'secret' => $response->json('webhook.secret')];
    }
}
