<?php

namespace App\Services\Account;

use App\Models\PublishedProject;
use App\Models\User;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class AccountDeletion
{
    public function delete(User $user, ?array $appleRevocation = null): bool
    {
        $id = (int) $user->getKey();
        app(\App\Services\CloudWorkspaces\AccountCleanup::class)->prepare($id);
        $disk = (string) config('vibes.attachments_disk', 'local');
        $directory = 'vibes-attachments/'.$id;

        app(\App\Services\Remote\RemoteAccountSecurity::class)->updateIdentity($id, function (User $user) use ($id, $disk, $directory, $appleRevocation): void {
            $subscriptions = array_values(array_unique(array_filter([
                trim((string) ($user->stripe_subscription_id ?? '')),
                ...DB::table('membership_periods')->where('user_id', $id)->where('provider', 'stripe')
                    ->whereNull('revoked_at')->where(fn ($query) => $query->whereNull('ends_at')
                        ->orWhere('ends_at', '>', now()))->pluck('subscription_id')->all(),
            ], fn ($value) => is_string($value) && $value !== '')));
            if ($user->provider === 'apple') app(AppleRevocationQueue::class)->stage($id, $appleRevocation);
            app(\App\Services\Remote\RemoteAccountSecurity::class)->revokeHostsForDeletion($id);
            // Preserve the released archive-removal contract; a failure leaves the account intact.
            $exports = \App\Services\Privacy\AccountExports::class;
            if (\App\Models\AccountExport::query()->where('user_id', $id)->exists()
                && !Storage::disk($exports::disk())->deleteDirectory($exports::directory($id)))
                throw new RuntimeException('The account archive could not be removed.');
            // The cleanup record survives the user row and is retried by the scheduler.
            DB::table('account_deletion_cleanups')->updateOrInsert(
                ['user_id' => $id],
                ['disk' => $disk, 'attachment_directory' => $directory,
                    'stripe_subscription_ids' => json_encode($subscriptions),
                    'status' => 'pending', 'next_attempt_at' => now(),
                    'updated_at' => now(), 'created_at' => now()],
            );

            PublishedProject::where('user_id', $id)->with('deployments')->get()
                ->each(fn (PublishedProject $project) => app(RuntimeDemoLifecycleService::class)
                    ->retireProject($project, 'account_deleted'));

            // Comments and reports on someone else's project otherwise survive with
            // a null author, including their free text and report screenshots.
            $commentProjects = DB::table('published_project_comments')->where('user_id', $id)
                ->pluck('published_project_id')->unique();
            DB::table('published_project_comments')->where('user_id', $id)->delete();
            foreach ($commentProjects as $projectId) {
                DB::table('published_projects')->where('id', $projectId)->update([
                    'comments_count' => DB::table('published_project_comments')
                        ->where('published_project_id', $projectId)->count(),
                ]);
            }
            $reactionProjects = DB::table('published_project_reactions')->where('user_id', $id)
                ->pluck('published_project_id')->unique();
            DB::table('published_project_reactions')->where('user_id', $id)->delete();
            foreach ($reactionProjects as $projectId) {
                DB::table('published_projects')->where('id', $projectId)->update([
                    'likes_count' => DB::table('published_project_reactions')
                        ->where('published_project_id', $projectId)->where('type', 'like')->count(),
                ]);
            }
            DB::table('published_project_reports')->where('reporter_user_id', $id)->update([
                'details' => null, 'screenshot_data_url' => null,
            ]);

            $subjectHashes = DB::table('analytics_consents')->where('user_id', $id)
                ->pluck('subject_hash')->merge(
                    DB::table('analytics_consent_changes')->where('user_id', $id)
                        ->pluck('subject_hash')
                )->unique()->values()->all();
            DB::table('analytics_events')->where('user_id', $id)->delete();
            if ($subjectHashes !== []) {
                DB::table('analytics_events')->whereIn('consent_subject_hash', $subjectHashes)->delete();
            }
            DB::table('analytics_consents')->where('user_id', $id)->delete();
            DB::table('analytics_consent_changes')->where('user_id', $id)->delete();
            if (config('session.driver') === 'database') DB::connection(config('session.connection'))
                ->table((string) config('session.table', 'sessions'))->where('user_id', $id)->delete();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();

            // Keep financial references for statutory accounting/disputes, but
            // remove the short-lived checkout URL and detach the user via FK.
            DB::table('membership_orders')->where('user_id', $id)->update(['checkout_url' => null]);

            // Agent V2 journals, receipts and notification outbox carry no user id (no cascade): purge them by run and item.
            app(\App\Services\AgentRuns\Retention::class)->purgeAccount($id);

            if (! $user->delete()) {
                throw new RuntimeException('The account could not be deleted.');
            }
        });

        return $this->cleanPending($id);
    }

    /** Idempotent: a missing directory is already clean. */
    public function cleanPending(int $userId): bool
    {
        return DB::transaction(function () use ($userId): bool {
            // Only this durable cleanup row is locked; concurrent sweepers cannot overwrite progress.
            $row = DB::table('account_deletion_cleanups')->where('user_id', $userId)->lockForUpdate()->first();
            if (! $row || $row->status === 'complete') {
                return true;
            }

            // Phone-chat attachments and Agent V2 uploads (another directory, possibly another disk) both go.
            $v2 = \App\Services\AgentRuns\Retention::attachmentsOf($userId);
            $storageClean = true;
            // "Download my data" archives (roadmap Part 19) live in a third directory, on their own disk.
            $dirs = [[$row->disk, $row->attachment_directory], [$v2['disk'], $v2['directory']],
                [\App\Services\Privacy\AccountExports::disk(), \App\Services\Privacy\AccountExports::directory($userId)]];
            foreach ($dirs as [$diskName, $directory]) {
                try {
                    $storage = Storage::disk($diskName);
                    $storageClean = $storageClean && (! $storage->directoryExists($directory) || $storage->deleteDirectory($directory));
                } catch (\Throwable) {
                    $storageClean = false;
                }
            }

            $remaining = json_decode((string) ($row->stripe_subscription_ids ?? '[]'), true);
            $remaining = is_array($remaining) ? $remaining : [];
            foreach ($remaining as $index => $subscriptionId) {
                try {
                    app(StripeSubscriptionCancellation::class)->cancel((string) $subscriptionId);
                    unset($remaining[$index]);
                } catch (\Throwable) {
                    // Retry without restoring the deleted account or losing progress.
                }
            }
            $remaining = array_values($remaining);
            $apple = $this->appleRevocationStatus($userId);
            $localComplete = $storageClean && $remaining === [];
            $complete = $localComplete && in_array($apple, ['not_required', 'complete'], true);

            if (!$complete && (int) $row->attempts + 1 === 10) \Illuminate\Support\Facades\Log::warning('account.deletion.cleanup_exhausted');
            DB::table('account_deletion_cleanups')->where('id', $row->id)->update([
                'stripe_subscription_ids' => json_encode($remaining),
                'status' => $complete ? 'complete' : ($localComplete && $apple === 'manual' ? 'manual' : 'pending'),
                'last_error' => $complete ? null : (! $storageClean ? 'attachment_delete_failed'
                    : ($remaining !== [] ? 'stripe_cancel_failed' : 'apple_revocation_'.$apple)),
                'attempts' => (int) $row->attempts + 1,
                'next_attempt_at' => $complete ? null : now()->addMinutes(min(60, 2 ** min(6, (int) $row->attempts))),
                'completed_at' => $complete ? now() : null,
                'updated_at' => now(),
            ]);

            return $complete;
        });
    }

    public function appleRevocationStatus(int $userId): string
    {
        return app(AppleRevocationQueue::class)->status($userId);
    }
}
