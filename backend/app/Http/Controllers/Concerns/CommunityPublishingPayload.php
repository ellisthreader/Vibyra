<?php

namespace App\Http\Controllers\Concerns;

trait CommunityPublishingPayload
{
    use CommunityPublishingPresentation;
    use CommunityPublishingAccess;
    use CommunityPublishingLifecycle;
    use CommunityPublishingCapabilities;
    use CommunityPublishingUrlPolicy;
    use CommunityPublishingUtilities;
}
