<?php
namespace App\Services\CloudComputer\Activity;

use App\Services\CloudComputer\{Computers, ConnectConsent};
use App\Services\CloudWorkspaces\{Runtime, Workspaces};
use Illuminate\Support\Facades\DB;

/** Phase metadata and its fanout obey the same agreement, runtime generation and project choices as Cloud work. */
final class EventAuthority
{
    public function withCurrent(object $initial, callable $operation): mixed
    {
        return app(Runtime::class)->withCurrent($initial, function ($w) use ($operation) {
            // Runtime holds the wallet lock, as withdrawal does. Project decisions serialize on users next.
            DB::table('users')->where('id', $w->user_id)->lockForUpdate()->first();
            if (!app(ConnectConsent::class)->connected((int) $w->user_id)) {
                Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
            }
            return $operation($w);
        });
    }

    /** A removed sync project cannot borrow a native queue entry or a same-named tick. Host listings are not grants. */
    public function allowsProject(object $w, string $name): bool
    {
        return app(\App\Services\CloudComputer\Owners\OwnerProjects::class)->allowed((int) $w->user_id, $name, $w->id);
    }

    /** Fresh read immediately before a delayed delivery; an event from an older boot never starts or alerts a card. */
    public function deliveryCurrent(object $event): ?object
    {
        if (!($event->workspace_id ?? null) || ($event->runtime_generation ?? null) === null || !isset($event->user_id, $event->project)) return null;
        $w = DB::table('cloud_workspaces')->where('id', $event->workspace_id)->where('user_id', $event->user_id)
            ->where('generation', $event->runtime_generation)->whereIn('state', Workspaces::ACTIVE)->first();
        if (!$w || !app(ConnectConsent::class)->connected((int) $w->user_id) || !$this->allowsProject($w, $event->project)) return null;
        return $w;
    }
}
