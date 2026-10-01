<?php

namespace App\Services\Membership;

use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/** A subscription order can have several independently pending payment reversals. */
final class StripeReconciliation
{
    public const PENDING = ['pending', 'processing', 'failed'];

    public function withWallet(int $user, callable $work): mixed
    {
        return DB::transaction(function () use ($user, $work) {
            app(Wallet::class)->lock($user);
            return $work();
        }, 5);
    }

    public function track(string $event, string $orderId): bool
    {
        $order = DB::table('membership_orders')->where('id', $orderId)->first();
        if (!$order) return false;
        return $this->withWallet($order->user_id, function () use ($event, $orderId) {
            $row = DB::table('membership_events')->where('id', $event)->lockForUpdate()->firstOrFail();
            if ($row->status === 'legacy' || ($row->status === 'processed' && $row->order_id)) return false;
            abort_if($row->order_id && $row->order_id !== $orderId, 409, 'Reversal order changed.');
            DB::table('membership_events')->where('id', $event)->update(['order_id' => $orderId,
                'status' => 'processing', 'error' => null, 'updated_at' => now()]);
            DB::table('membership_orders')->where('id', $orderId)->update(['refund_pending' => true]);
            return true;
        });
    }

    public function finish(string $event, bool $handled): bool
    {
        $row = DB::table('membership_events')->where('id', $event)->firstOrFail();
        if (!$row->order_id) {
            DB::table('membership_events')->where('id', $event)->whereNull('order_id')->where('status', '!=', 'legacy')
                ->update(['status' => $handled ? 'processed' : 'legacy', 'error' => null, 'updated_at' => now()]);
            $fresh = DB::table('membership_events')->where('id', $event)->firstOrFail();
            if ($fresh->order_id) return $this->finish($event, $handled);
            return $fresh->status === 'processed';
        }
        $order = DB::table('membership_orders')->where('id', $row->order_id)->firstOrFail();
        return $this->withWallet($order->user_id, function () use ($event, $handled, $order) {
            $current = DB::table('membership_events')->where('id', $event)->lockForUpdate()->firstOrFail();
            // An unassociated classification can lose the race to a canonical association.
            // That older result must not turn another handler's tracked reversal into legacy.
            abort_unless($handled || $current->status === 'processed', 503, 'Reversal association needs reconciliation.');
            if ($current->status !== 'processed') DB::table('membership_events')->where('id', $event)
                ->update(['status' => $handled ? 'processed' : 'legacy', 'error' => null, 'updated_at' => now()]);
            $this->refreshLocked($order->id);
            return $current->status === 'processed' || $handled;
        });
    }

    public function fail(string $event): void
    {
        // A slower duplicate must not downgrade the event completed by another handler.
        DB::table('membership_events')->where('id', $event)->whereNotIn('status', ['processed', 'legacy'])
            ->update(['status' => 'failed', 'error' => 'Provider reconciliation required', 'updated_at' => now()]);
    }

    public function refreshResolved(int $limit): void
    {
        // Also revisits holds conservatively retained while old unassociated events replayed.
        $orders = DB::table('membership_orders')->where('refund_pending', true)
            ->whereIn('id', $this->events()->whereNotNull('order_id')->select('order_id'))
            ->orderBy('created_at')->limit($limit)->get(['id', 'user_id']);
        foreach ($orders as $order) $this->withWallet($order->user_id, fn () => $this->refreshLocked($order->id));
    }

    public function replayable(int $limit): \Illuminate\Support\Collection
    {
        $repair = DB::table('membership_orders')->where('refund_pending', true)->exists();
        return $this->events()->where(function ($q) use ($repair) {
            $q->whereIn('status', ['pending', 'failed'])->orWhere(fn ($q) => $q->where('status', 'processing')
                ->where('updated_at', '<', now()->subMinutes(5)));
            if ($repair) $q->orWhere(fn ($q) => $q->where('status', 'processed')->whereNull('order_id')
                ->where(fn ($q) => $q->where('type', 'charge.refunded')->orWhere('type', 'like', 'charge.dispute.%')));
        })->orderBy('created_at')->limit($limit)->get();
    }

    private function events(): \Illuminate\Database\Query\Builder
    {
        return DB::table('membership_events')->where('id', 'like', 'stripe:'.config('membership.stripe_environment', 'live').':%');
    }

    private function refreshLocked(string $order): void
    {
        $pending = $this->events()->where('order_id', $order)->whereIn('status', self::PENDING)->exists();
        $unmapped = $this->events()->whereNull('order_id')->whereIn('status', self::PENDING)
            ->where(fn ($q) => $q->where('type', 'charge.refunded')->orWhere('type', 'like', 'charge.dispute.%'))->exists();
        // Fail closed for pre-upgrade unresolved events until canonical replay identifies them.
        DB::table('membership_orders')->where('id', $order)->update(['refund_pending' => $pending || $unmapped]);
    }
}
