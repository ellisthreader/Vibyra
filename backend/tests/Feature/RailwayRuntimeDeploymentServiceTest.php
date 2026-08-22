<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\CreatesRailwayRuntimeDeployment;
use Tests\Feature\Concerns\TestsRailwayCliDeployment;
use Tests\Feature\Concerns\TestsRailwayCliRecovery;
use Tests\Feature\Concerns\TestsRailwayCredentials;
use Tests\Feature\Concerns\TestsRailwayLaravelRuntime;
use Tests\Feature\Concerns\TestsRailwayProvisioning;
use Tests\Feature\Concerns\TestsRailwayPublicReadiness;
use Tests\Feature\Concerns\TestsRailwayUploads;
use Tests\TestCase;

class RailwayRuntimeDeploymentServiceTest extends TestCase
{
    use CreatesRailwayRuntimeDeployment;
    use RefreshDatabase;
    use TestsRailwayCliDeployment;
    use TestsRailwayCliRecovery;
    use TestsRailwayCredentials;
    use TestsRailwayLaravelRuntime;
    use TestsRailwayProvisioning;
    use TestsRailwayPublicReadiness;
    use TestsRailwayUploads;
}
