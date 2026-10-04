<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * The portal's Developer and Activity pages authenticate by the website session cookie, so their routes must sit in the
 * web middleware group (session and CSRF) as well as behind auth. A route with `auth` alone has no session to read.
 */
class PlatformPortalRoutesTest extends TestCase
{
    public function test_portal_routes_run_in_the_web_group_with_auth(): void
    {
        foreach (['web-api/developer', 'web-api/account/activity', 'account/developer'] as $uri) {
            $route = Route::getRoutes()->match(\Illuminate\Http\Request::create('/'.$uri, 'GET'));
            $middleware = $route->gatherMiddleware();

            $this->assertContains('web', $middleware, $uri.' needs the web group for its session.');
            $this->assertContains('auth', $middleware, $uri.' needs auth.');
        }
    }
}
