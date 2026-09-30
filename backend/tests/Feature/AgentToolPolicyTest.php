<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\Registry;
use Tests\TestCase;

class AgentToolPolicyTest extends TestCase
{
    public function test_every_advertised_connector_operation_has_an_explicit_risk(): void
    {
        $registry = app(Registry::class);
        $policy = app(ToolPolicy::class);
        foreach ($registry->slugs() as $slug) {
            $connector = $registry->for($slug);
            $offered = array_column(array_column($connector->definitions(), 'function'), 'name');
            foreach ($offered as $operation) {
                $this->assertSame(in_array($operation, $connector->writes(), true),
                    $policy->requiresApproval($slug, $operation), $operation);
            }
        }
    }
}
