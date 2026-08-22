<?php

namespace App\Http\Controllers\Concerns;

trait CommunityPublishing
{
    use CommunityPublishingPayload;
    use CommunityPublishingReadEndpoints;
    use CommunityPublishingReviewEndpoint;
    use CommunityPublishingPublishEndpoint;
    use CommunityPublishingListingEndpoints;
    use CommunityPublishingPreviewEndpoints;
    use CommunityPublishingDeployment;
    use CommunityPublishingHostedDemo;
    use CommunityPublishingRuntimeBundle;
    use CommunityPublishingRuntimePolicy;
    use CommunityPublishingEngagementEndpoints;
}
