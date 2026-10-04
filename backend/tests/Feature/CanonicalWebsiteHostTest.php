<?php

namespace Tests\Feature;

use Tests\TestCase;

class CanonicalWebsiteHostTest extends TestCase
{
    public function test_website_pages_on_the_railway_host_move_to_vibyra_net(): void
    {
        foreach (['/', '/legal/terms', '/login', '/checkout?offer=pro_monthly&version=2', '/account/downloads'] as $path) {
            $this->get('https://vibyra-production.up.railway.app'.$path)
                ->assertStatus(301)->assertRedirect('https://vibyra.net'.$path);
        }
    }

    public function test_apis_downloads_and_callbacks_stay_on_the_railway_host(): void
    {
        foreach (['/api/billing/catalogue?version=2', '/web-api/releases', '/downloads/mac', '/api/auth/desktop/google/callback',
            '/reset-password', '/.well-known/apple-app-site-association', '/web-api/updates/darwin/aarch64/app/0.8.0'] as $path) {
            $status = $this->get('https://vibyra-production.up.railway.app'.$path)->getStatusCode();
            $this->assertNotSame(301, $status, $path);
        }
    }

    public function test_the_real_website_is_left_alone(): void
    {
        $this->assertNotSame(301, $this->get('https://vibyra.net/legal/terms')->getStatusCode());
    }
}
