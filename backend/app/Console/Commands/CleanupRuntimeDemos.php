<?php

namespace App\Console\Commands;

use App\Models\PublishedProjectRuntimeCleanup;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;
use Throwable;

class CleanupRuntimeDemos extends Command
{
    protected $signature = 'vibyra:cleanup-runtime-demos {--limit=5}';

    protected $description = 'Delete retired Vibyra runtime demo projects from their provider.';

    public function handle(RailwayRuntimeDeploymentService $railway): int
    {
        $cleanups = PublishedProjectRuntimeCleanup::query()
            ->where('status', 'pending')
            ->where(fn ($query) => $query->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))
            ->oldest()
            ->limit(max(1, min(20, (int) $this->option('limit'))))
            ->get();

        foreach ($cleanups as $cleanup) {
            $claimed = PublishedProjectRuntimeCleanup::query()
                ->whereKey($cleanup->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'processing',
                    'attempts' => $cleanup->attempts + 1,
                    'updated_at' => now(),
                ]);
            if ($claimed !== 1) {
                continue;
            }
            $cleanup = $cleanup->fresh();

            try {
                if ($cleanup->provider !== 'railway' || $railway->deleteProject($cleanup->provider_project_id)) {
                    $cleanup->forceFill([
                        'status' => 'completed',
                        'completed_at' => now(),
                        'last_error' => null,
                    ])->save();

                    continue;
                }
                throw new \RuntimeException('Provider did not confirm project deletion.');
            } catch (Throwable $error) {
                $cleanup->forceFill([
                    'status' => 'pending',
                    'last_error' => Str::limit($error->getMessage(), 900, ''),
                    'next_attempt_at' => now()->addMinutes(min(60, 2 ** min($cleanup->attempts, 5))),
                ])->save();
            }
        }

        return self::SUCCESS;
    }
}
