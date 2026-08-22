<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\NextTen\TestsAuthAccountLifecycle;
use Tests\Feature\Concerns\NextTen\TestsAuthSessionManagement;
use Tests\Feature\Concerns\NextTen\TestsAuthProxyLocation;
use Tests\Feature\Concerns\NextTen\TestsAuthReferrals;
use Tests\TestCase;

class VibyraAuthReferralApiTest extends TestCase
{
    use RefreshDatabase;
    use TestsAuthAccountLifecycle,
        TestsAuthSessionManagement,
        TestsAuthProxyLocation,
        TestsAuthReferrals;
}
