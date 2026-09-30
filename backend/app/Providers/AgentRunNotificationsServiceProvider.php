<?php
namespace App\Providers;
use App\Models\AgentV2\RunEvent;
use App\Models\User;
use App\Services\AgentRuns\Retention;
use App\Services\Notifications\AgentRunNotifications;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;
/**
 * Agent V2 hooks that live outside AgentRuns/*, so nothing else has to know about them.
 *
 * Phase 3: the listener fires inside Events::append's transaction, so notification outbox rows share the journal
 * event's commit. F-04: an account's V2 rows that no foreign key reaches (journals, receipts, notification outbox) are
 * purged just before its user row is deleted, and its uploaded files just after; a failure is reported and never
 * blocks the deletion (the daily `vibyra:agent-v2-retention` sweeps orphans).
 */
final class AgentRunNotificationsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RunEvent::created(fn (RunEvent $event) => app(AgentRunNotifications::class)->record($event));
        User::deleting(function (User $user): void {
            try { app(Retention::class)->purgeAccount((int) $user->id); } catch (\Throwable $e) { report($e); }
        });
        User::deleted(function (User $user): void {
            try {
                $files = Retention::attachmentsOf((int) $user->id);
                Storage::disk($files['disk'])->deleteDirectory($files['directory']);
            } catch (\Throwable $e) { report($e); }
        });
    }
}
