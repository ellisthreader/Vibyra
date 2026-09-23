<?php
namespace App\Console\Commands;
use App\Jobs\{CheckPhoneReceipt, DeliverPhoneNotification};
use App\Services\Notifications\Inbox;
use App\Services\Progress\WorkEvents;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
final class ObserveWork extends Command
{
    protected $signature = 'vibyra:observe-work';
    protected $description = 'Project runtime facts and drain the notification outbox without replaying execution';
    public function handle(WorkEvents $events, Inbox $inbox): int
    {
        if (config('intelligence.events')) {
            DB::table('vibes_turns')->where(fn ($q) => $q->whereNull('settled_at')->orWhere('settled_at', '>', now()->subMinutes(5)))
                ->orderBy('id')->chunkById(100, function ($turns) use ($events) { foreach ($turns as $t) $events->observe($t->id); });
        }
        if (config('intelligence.inbox')) {
            foreach (DB::table('work_events')->whereNull('published_at')->orderBy('id')->limit(500)->pluck('id') as $id) $inbox->publish($id);
        }
        // A dead delivery worker may have sent: retry is bounded and may duplicate only an OS alert, never execution.
        DB::table('notification_deliveries')->where('state', 'sending')->where('claimed_at', '<', now()->subMinutes(2))
            ->update(['state' => 'failed', 'error' => 'DeliveryUnconfirmed', 'updated_at' => now()]);
        foreach (DB::table('notification_deliveries')->whereIn('state', ['pending','ticketed'])->where('next_at', '<=', now())
            ->orderBy('id')->limit(200)->get() as $d) {
            if ($d->state === 'ticketed') CheckPhoneReceipt::dispatch($d->id);
            elseif (config('intelligence.push')) DeliverPhoneNotification::dispatch($d->id);
        }
        $monitor = app(\App\Services\Progress\ProgressMonitor::class);
        if (config('intelligence.events')) {
            DB::table('work_progress')->where('source', 'cloud_turn')->whereIn('phase', ['working','queued','tool_waiting'])
                ->chunkById(100, function ($rows) use ($monitor) { foreach ($rows as $p) $monitor->consider($p); });
            DB::table('ai_decisions')->where('purpose', 'progress')->where('state', 'classified')
                ->chunkById(100, function ($rows) use ($monitor) { foreach ($rows as $d) $monitor->apply($d); });
        }
        DB::table('ai_decisions')->where('created_at', '<', now()->subDay())->update(['input' => null, 'result' => null, 'state' => 'expired']);
        DB::table('ai_decisions')->where('created_at', '<', now()->subDays(30))->delete();
        DB::table('notification_deliveries')->where('created_at', '<', now()->subDays(90))->delete();
        DB::table('notification_items')->where('created_at', '<', now()->subDays(90))->delete();
        DB::table('work_events')->where('created_at', '<', now()->subDays(30))->whereNotNull('published_at')->delete();
        return self::SUCCESS;
    }
}
