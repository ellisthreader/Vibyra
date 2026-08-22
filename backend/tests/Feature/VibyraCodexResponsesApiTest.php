<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Support\CodexResponses\CodexResponsesBillingLimitCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesCapacityCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesDynamicModelCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesModelPolicyCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesNativeStreamCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesStreamOutcomeCases;
use Tests\Feature\Support\CodexResponses\CodexResponsesTestSupport;
use Tests\TestCase;

class VibyraCodexResponsesApiTest extends TestCase
{
    use RefreshDatabase;
    use CodexResponsesBillingLimitCases;
    use CodexResponsesCapacityCases;
    use CodexResponsesDynamicModelCases;
    use CodexResponsesModelPolicyCases;
    use CodexResponsesNativeStreamCases;
    use CodexResponsesStreamOutcomeCases;
    use CodexResponsesTestSupport;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setTerminalModelCapabilities([
            'openai/gpt-5.5' => ['tools'],
        ]);
    }
}
