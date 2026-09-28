<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Tests\Feature\Concerns\CommunityPublishing\CommunityPublishingModeration;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoStaticLifecycleTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoOpenabilityTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoReleaseFallbackTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoPrivateDeploymentUrlTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoStaticUrlSafetyTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoRuntimeQueueTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoPackagingFallbackTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoPythonRuntimeTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoRuntimeUrlSafetyTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoBundleLimitTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoFullStackArtifactTests;
use Tests\Feature\Concerns\CommunityPublishing\HostedDemoRuntimeReviewTests;

class CommunityPublishingHostedDemoTest extends TestCase
{
    use RefreshDatabase;
    use CommunityPublishingModeration;
    use HostedDemoStaticLifecycleTests;
    use HostedDemoOpenabilityTests;
    use HostedDemoReleaseFallbackTests;
    use HostedDemoPrivateDeploymentUrlTests;
    use HostedDemoStaticUrlSafetyTests;
    use HostedDemoRuntimeQueueTests;
    use HostedDemoPackagingFallbackTests;
    use HostedDemoPythonRuntimeTests;
    use HostedDemoRuntimeUrlSafetyTests;
    use HostedDemoBundleLimitTests;
    use HostedDemoFullStackArtifactTests;
    use HostedDemoRuntimeReviewTests;
}
