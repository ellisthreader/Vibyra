<?php

namespace Tests\Feature\Concerns;

use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;

trait TestsRailwayUploads
{
    public function test_direct_uploader_sends_gzip_archive_with_project_token(): void
    {
        Http::fake([
            'https://backboard.railway.com/project/*' => Http::response([
                'deploymentId' => 'deployment_direct',
                'deploymentDomain' => 'direct-demo.up.railway.app',
            ]),
        ]);
        $deployment = $this->runtimeDeployment();
        $deployment->forceFill([
            'provider_project_id' => 'project_direct',
            'provider_service_id' => 'service_direct',
            'metadata' => [
                'platform' => 'node',
                'providerEnvironmentId' => 'environment_direct',
            ],
        ])->save();
        $workdir = storage_path('app/runtime-upload-test');
        $archivePath = $workdir.'.tar.gz';
        File::deleteDirectory($workdir);
        File::delete($archivePath);
        File::ensureDirectoryExists($workdir);
        File::put($workdir.'/server.js', 'console.log("ready");');
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'uploadSourceArchive');
        $result = $method->invoke(
            new RailwayRuntimeDeploymentService,
            $deployment,
            $workdir,
            $archivePath,
            'project-token',
        );

        $this->assertTrue($result['ok']);
        $this->assertSame('deployment_direct', json_decode($result['output'], true)['deploymentId']);
        Http::assertSent(function ($request): bool {
            return $request->hasHeader('project-access-token', 'project-token')
                && $request->hasHeader('Content-Type', 'application/gzip')
                && str_starts_with($request->body(), "\x1f\x8b");
        });
        File::deleteDirectory($workdir);
        File::delete($archivePath);
    }

    public function test_direct_uploader_retries_auth_rejection_with_account_token(): void
    {
        config(['services.railway.api_token' => 'test-account-token']);
        Http::fakeSequence()
            ->push(['message' => 'You must be logged in to deploy'], 400)
            ->push([
                'deploymentId' => 'deployment_fallback',
                'deploymentDomain' => 'fallback-demo.up.railway.app',
            ]);
        $deployment = $this->runtimeDeployment();
        $deployment->forceFill([
            'provider_project_id' => 'project_fallback',
            'provider_service_id' => 'service_fallback',
            'metadata' => [
                'platform' => 'node',
                'providerEnvironmentId' => 'environment_fallback',
            ],
        ])->save();
        $workdir = storage_path('app/runtime-upload-fallback-test');
        $archivePath = $workdir.'.tar.gz';
        File::deleteDirectory($workdir);
        File::delete($archivePath);
        File::ensureDirectoryExists($workdir);
        File::put($workdir.'/server.js', 'console.log("ready");');
        $method = new ReflectionMethod(new RailwayRuntimeDeploymentService, 'uploadSourceArchive');
        $result = $method->invoke(
            new RailwayRuntimeDeploymentService,
            $deployment,
            $workdir,
            $archivePath,
            'project-token',
        );

        $this->assertTrue($result['ok']);
        $this->assertSame('deployment_fallback', json_decode($result['output'], true)['deploymentId']);
        Http::assertSentCount(2);
        Http::assertSent(function ($request): bool {
            return $request->hasHeader('Authorization', 'Bearer test-account-token')
                && $request->hasHeader('Content-Type', 'application/gzip');
        });
        File::deleteDirectory($workdir);
        File::delete($archivePath);
    }
}
