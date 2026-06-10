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
            ->assertHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

        $this->withHeader('Origin', 'https://app.vibyra.example.evil')
            ->optionsJson('/api/account/sessions')
            ->assertNoContent()
            ->assertHeaderMissing('Access-Control-Allow-Origin')
            ->assertHeader('Vary', 'Origin');
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
            ->assertHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibyra-Public-IP');
    }
}
