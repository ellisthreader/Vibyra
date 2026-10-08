<?php

namespace Tests\Feature;

use Tests\TestCase;

class VibyraCorsTest extends TestCase
{
    public function test_production_policy_reflects_only_exact_approved_origin(): void
    {
        config([
            'vibyra_cors.allow_any_origin' => false,
            'vibyra_cors.allowed_origins' => ['https://app.vibyra.example'],
        ]);

        $this->withHeader('Origin', 'https://app.vibyra.example')
            ->optionsJson('/api/account/sessions')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://app.vibyra.example')
            ->assertHeader('Vary', 'Origin')
            ->assertHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

        $this->withHeader('Origin', 'https://app.vibyra.example.evil')
            ->optionsJson('/api/account/sessions')
            ->assertNoContent()
            ->assertHeaderMissing('Access-Control-Allow-Origin')
            ->assertHeader('Vary', 'Origin');
    }

    public function test_cloud_put_preflight_is_allowed_only_for_an_approved_origin(): void
    {
        config(['vibyra_cors.allow_any_origin' => false,
            'vibyra_cors.allowed_origins' => ['https://phone.vibyra.example']]);
        $this->withHeaders(['Origin' => 'https://phone.vibyra.example',
            'Access-Control-Request-Method' => 'PUT', 'Access-Control-Request-Headers' => 'authorization,content-type'])
            ->optionsJson('/api/cloud-computer/access/providers/codex')
            ->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'https://phone.vibyra.example')
            ->assertHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        $this->withHeader('Origin', 'https://untrusted.example')
            ->optionsJson('/api/cloud-computer/access/providers/codex')
            ->assertNoContent()->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    public function test_local_testing_policy_keeps_wildcard_compatibility(): void
    {
        config([
            'vibyra_cors.allow_any_origin' => true,
            'vibyra_cors.allowed_origins' => [],
        ]);

        $this->withHeader('Origin', 'http://localhost:8081')
            ->optionsJson('/api/account/sessions')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', '*')
            ->assertHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP, X-Vibyra-Cloud-Access, X-Vibyra-Flow-Secret');
    }
}
