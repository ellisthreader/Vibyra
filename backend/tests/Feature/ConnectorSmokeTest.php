<?php

namespace Tests\Feature;

use Tests\TestCase;

class ConnectorSmokeTest extends TestCase
{
    public function test_unknown_or_unconfigured_integrations_cannot_pass_acceptance(): void
    {
        $this->artisan('connectors:smoke', ['only' => 'not-a-provider'])->assertFailed();
        $saved = getenv('SMOKE_FIGMA_TOKEN');
        putenv('SMOKE_FIGMA_TOKEN=');
        try { $this->artisan('connectors:smoke', ['only' => 'figma'])->assertFailed(); }
        finally { $saved === false ? putenv('SMOKE_FIGMA_TOKEN') : putenv('SMOKE_FIGMA_TOKEN='.$saved); }
    }
}
