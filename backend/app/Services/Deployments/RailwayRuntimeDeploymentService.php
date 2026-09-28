<?php

namespace App\Services\Deployments;

use App\Contracts\RuntimeDeploymentProvider;
use App\Services\Deployments\Concerns\HandlesRailwayBundleValidation;
use App\Services\Deployments\Concerns\HandlesRailwayCliDiscovery;
use App\Services\Deployments\Concerns\HandlesRailwayDeploymentState;
use App\Services\Deployments\Concerns\HandlesRailwayDeploymentWorkflow;
use App\Services\Deployments\Concerns\HandlesRailwayGraphql;
use App\Services\Deployments\Concerns\HandlesRailwayLaravelRuntime;
use App\Services\Deployments\Concerns\HandlesRailwayProviderTransport;
use App\Services\Deployments\Concerns\HandlesRailwayPublicReadiness;
use App\Services\Deployments\Concerns\HandlesRailwayTargetProvisioning;

class RailwayRuntimeDeploymentService implements RuntimeDeploymentProvider
{
    use HandlesRailwayBundleValidation;
    use HandlesRailwayCliDiscovery;
    use HandlesRailwayDeploymentState;
    use HandlesRailwayDeploymentWorkflow;
    use HandlesRailwayGraphql;
    use HandlesRailwayLaravelRuntime;
    use HandlesRailwayProviderTransport;
    use HandlesRailwayPublicReadiness;
    use HandlesRailwayTargetProvisioning;

    private const GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';

    private const MAX_RUNTIME_BUNDLE_BYTES = 10_000_000;

    private const MAX_RUNTIME_BUNDLE_FILES = 320;

    private string $lastRailwayError = '';

    public function __construct(private mixed $runner = null) {}
}
