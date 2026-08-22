<?php

namespace Tests\Feature\Concerns;

use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;

trait TestsRailwayPublicReadiness
{
    public function test_readiness_rejects_html_when_a_same_host_frontend_asset_is_missing(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '<!doctype html><script src="/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.js' => Http::response('Not Found', 404),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertFalse($method->invoke(new RailwayRuntimeDeploymentService, $url));
    }

    public function test_readiness_accepts_working_backend_html_and_frontend_assets(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '<!doctype html><link rel="stylesheet" href="/build/assets/app.css"><script src="/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.css' => Http::response(
                'body { color: black; }',
                200,
                ['Content-Type' => 'text/css'],
            ),
            'https://runtime-demo.up.railway.app/build/assets/app.js' => Http::response(
                'console.log("ready");',
                200,
                ['Content-Type' => 'application/javascript'],
            ),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertTrue($method->invoke(new RailwayRuntimeDeploymentService, $url));
        Http::assertSentCount(3);
    }

    public function test_readiness_requires_html_when_bundle_contains_a_frontend(): void
    {
        $url = 'https://runtime-demo.up.railway.app/';
        Http::fake([
            $url => Http::response(
                '{"status":"ok"}',
                200,
                ['Content-Type' => 'application/json'],
            ),
        ]);
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'publicDemoUrlReady');

        $this->assertFalse($method->invoke(new RailwayRuntimeDeploymentService, $url, true));
    }

    public function test_readiness_rejects_same_host_http_assets_from_html_or_link_headers(): void
    {
        $url = 'https://vibyra-demo-21-production.up.railway.app/';
        $service = new RailwayRuntimeDeploymentService;
        $readiness = new ReflectionMethod($service, 'publicDemoUrlReady');
        Http::fakeSequence()
            ->push(
                '<script src="http://vibyra-demo-21-production.up.railway.app/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            )
            ->push(
                '<html><body>Demo</body></html>',
                200,
                ['Link' => '<http://vibyra-demo-21-production.up.railway.app/build/assets/app.css>; rel=preload; as=style'],
            )
            ->push(
                '<script src="https://${RAILWAY_PUBLIC_DOMAIN}/build/assets/app.js"></script>',
                200,
                ['Content-Type' => 'text/html'],
            )
            ->push(
                '<script src="https://vibyra-demo-21-production.up.railway.app/build/assets/app.js"></script>',
                200,
                ['Link' => '<https://vibyra-demo-21-production.up.railway.app/build/assets/app.css>; rel=preload; as=style'],
            )
            ->push('console.log("ready");', 200, ['Content-Type' => 'application/javascript'])
            ->push('body {}', 200, ['Content-Type' => 'text/css']);

        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertFalse($readiness->invoke($service, $url));
        $this->assertTrue($readiness->invoke($service, $url));
    }
}
