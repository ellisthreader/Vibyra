<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunityPublicCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_community_listing_is_session_free_and_edge_cacheable(): void
    {
        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertHeaderMissing('set-cookie')
            ->assertHeader('Cache-Control', 'max-age=30, public, s-maxage=60, stale-while-revalidate=120')
            ->assertHeader('Vary', 'Accept-Encoding, Authorization, Origin');
    }

    public function test_authenticated_community_listing_is_never_shared_cached(): void
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Private Viewer',
            'email' => 'private-viewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->getJson('/api/community/projects', ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertHeaderMissing('set-cookie')
            ->assertHeader('Cache-Control', 'no-store, private');
    }
}
