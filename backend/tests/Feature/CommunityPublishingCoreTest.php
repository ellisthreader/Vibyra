<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Feature\Concerns\CommunityPublishing\CommunityPublishingModeration;
use Tests\Feature\Concerns\CommunityPublishing\PublishingWorkflowTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingReviewOverrideTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingCommentModerationTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingDeterministicSafetyTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingPreviewSanitizationTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingAiReviewTests;
use Tests\Feature\Concerns\CommunityPublishing\PublishingReviewEscalationTests;

class CommunityPublishingCoreTest extends TestCase
{
    use RefreshDatabase;
    use CommunityPublishingModeration;
    use PublishingWorkflowTests;
    use PublishingReviewOverrideTests;
    use PublishingCommentModerationTests;
    use PublishingDeterministicSafetyTests;
    use PublishingPreviewSanitizationTests;
    use PublishingAiReviewTests;
    use PublishingReviewEscalationTests;

    protected function cleanModerationConfig(): array
    {
        return ['moderation.publish_review_temporarily_disabled' => false];
    }
}
