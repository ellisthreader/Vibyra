<?php

namespace Tests\Feature\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;

trait CreatesRailwayRuntimeDeployment
{
    private function runtimeDeployment(array $overrides = []): PublishedProjectDeployment
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'runtime-worker',
            'slug' => 'runtime-worker',
            'title' => 'Runtime Worker',
            'description' => 'Runtime worker test.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        return PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'build_command' => $overrides['buildCommand'] ?? null,
            'start_command' => $overrides['startCommand'] ?? 'npm run start',
            'metadata' => ['platform' => $overrides['platform'] ?? 'node'],
            'demo_files' => $overrides['files'] ?? [
                [
                    'path' => 'package.json',
                    'encoding' => 'utf8',
                    'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}',
                ],
                [
                    'path' => 'server.js',
                    'encoding' => 'utf8',
                    'body' => "import express from 'express';",
                ],
            ],
        ]);
    }
}
