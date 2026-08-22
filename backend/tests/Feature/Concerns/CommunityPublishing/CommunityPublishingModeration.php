<?php

namespace Tests\Feature\Concerns\CommunityPublishing;

use Illuminate\Support\Facades\Http;

trait CommunityPublishingModeration
{
    protected function fakeCleanModeration(): void
    {
        config(array_merge([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
        ], $this->cleanModerationConfig()));
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
        ]);
    }

    protected function cleanModerationConfig(): array
    {
        return [];
    }
}
