<?php
namespace App\Services\LiveActivities;

use App\Jobs\SendLiveActivityUpdate;
use App\Models\AgentV2\RunEvent;
use App\Services\Notifications\Devices;
use Illuminate\Support\Facades\{Cache, Crypt, DB};

/**
 * Run transitions -> Live Activity pushes. Called from the run journal's `run.state`
 * event (the "started / phase changed" hook the four notification hooks lack).
 * Rules: push only when the phase changed; collapse bursts into one push carrying the
 * latest state; priority 10 only for needs-a-person and ended; never retry a write.
 */
final class Dispatcher
{
    public function __construct(private readonly ApnsClient $apns, private readonly Preferences $prefs, private readonly Tokens $tokens) {}

    public static function enabled(): bool
    {
        return (bool) config('live_activities.enabled');
    }

    /** Journal hook: cheap, never throws into the run's transaction. */
    public function onRunEvent(RunEvent $event): void
    {
        if (!self::enabled() || $event->type !== 'run.state') return;
        $to = (string) ($event->payload['to'] ?? '');
        $phase = ContentState::phase($to);
        $urgent = ContentState::needsPerson($phase) || ContentState::isEnd($phase) || $to === 'cancelled';
        try {
            // One pending send per run: a burst is collapsed, and urgent moves are never held back.
            if ($urgent || Cache::add('live-activity:pending:'.$event->run_id, 1, 10)) {
                $job = SendLiveActivityUpdate::dispatch((string) $event->run_id)->afterCommit();
                if (!$urgent) $job->delay(now()->addSeconds((int) config('live_activities.coalesce_seconds', 2)));
            }
        } catch (\Throwable) {
            // A Live Activity must never fail a run transition.
        }
    }

    /** Sends the run's current state to every card showing it. */
    public function deliver(string $runId): void
    {
        Cache::forget('live-activity:pending:'.$runId);
        if (!$this->apns->enabled()) return;
        $run = $this->run($runId);
        if (!$run) {
            // Not an Agent run: it may be the card of a conversation on the Cloud Host (docs/cloud-switching-contract.md section 2).
            app(CloudHostCards::class)->deliver($runId);
            return;
        }
        $prefs = $this->prefs->get((int) $run['user_id']);
        if (!$prefs['enabled']) return;
        // A run that began on another device starts a card on this account's phones; sending is the job's work, never the journal's.
        $this->pushToStart($runId, $run);
        $content = ContentState::for($run, $prefs['details']);
        $cards = DB::table('live_activity_tokens')->where('run_id', $runId)->whereNull('revoked_at')->whereNull('ended_at')->get();
        foreach ($cards as $card) $this->deliverTo($card, $run, $content);
    }

    private function deliverTo(object $card, array $run, ?array $content): void
    {
        $device = DB::table('notification_devices')->where('id', $card->device_id)->first();
        if (!$device || $device->generation !== $card->generation || !app(Devices::class)->eligible($device)) {
            $this->tokens->revokeToken($card->id);
            return;
        }
        $phase = $content['phase'] ?? 'cancelled';
        if ($phase === $card->last_phase) return;
        $teammate = $run['name'];
        if ($content === null) {
            $payload = Payloads::remove(['phase' => 'failed', 'since' => time()]);
            $priority = 5;
        } else {
            [$payload, $priority] = Payloads::update($content, $teammate);
        }
        $result = $this->apns->send(Crypt::decryptString($card->token), $payload, $priority, 0);
        $status = $result['status'];
        if ($status === 200) {
            DB::table('live_activity_tokens')->where('id', $card->id)->update(['last_phase' => $phase, 'last_sent_at' => now(),
                'ended_at' => ($content === null || ContentState::isEnd($phase)) ? now() : null, 'updated_at' => now()]);
        } elseif ($status === 410 || in_array($result['reason'], ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'], true)) {
            $this->tokens->revokeToken($card->id);
        }
        // 429, 5xx or no answer: leave the card as it is. The next transition sends the then-current state.
    }

    /** A run that began elsewhere (Mac, Cloud, a routine or a trigger) starts a card on phones that never saw it. */
    private function pushToStart(string $runId, array $run): void
    {
        if (!in_array($run['state'], ['starting', 'running', 'waiting_for_tool'], true)) return;
        $prefs = $this->prefs->get((int) $run['user_id']);
        $content = ContentState::for($run, $prefs['details']);
        $attributes = Payloads::attributes($runId, (string) $run['agent_id'], $run['name'], $run['avatar']);
        $devices = DB::table('notification_devices')->where('user_id', $run['user_id'])->whereNull('revoked_at')->whereNotNull('push_to_start_token')->get();
        foreach ($devices as $device) {
            if (!app(Devices::class)->eligible($device)) continue;
            if (DB::table('live_activity_tokens')->where('device_id', $device->id)->where('run_id', $runId)->exists()) continue;
            // One start per device per run, however many times the run re-enters `running`.
            if (!Cache::add("live-activity:start:{$device->id}:$runId", 1, 86400)) continue;
            $this->apns->send(Crypt::decryptString($device->push_to_start_token), Payloads::start($content, $attributes), 5, 0);
        }
    }

    /** @return ?array{user_id:int,agent_id:string,state:string,since:?int,finished_at:?int,tool_kind:?string,name:string,avatar:string} */
    public function run(string $runId): ?array
    {
        $run = DB::table('agent_runs')->where('id', $runId)->first(['id', 'user_id', 'agent_id', 'state', 'created_at', 'finished_at']);
        if (!$run) return null;
        $teammate = DB::table('agent_teammates')->where('id', $run->agent_id)->first(['name', 'avatar']);
        $kind = DB::table('agent_tool_actions')->where('run_id', $runId)->orderByDesc('created_at')->value('kind');
        return ['user_id' => (int) $run->user_id, 'agent_id' => (string) $run->agent_id, 'state' => (string) $run->state,
            // The timer counts from when the person sent the task: the moment the phone uses too.
            'since' => $run->created_at ? strtotime((string) $run->created_at) : null,
            'finished_at' => $run->finished_at ? strtotime((string) $run->finished_at) : null,
            'tool_kind' => $kind ? (string) $kind : null, 'name' => (string) ($teammate->name ?? 'Your teammate'),
            'avatar' => (string) ($teammate->avatar ?? 'assistant')];
    }
}
