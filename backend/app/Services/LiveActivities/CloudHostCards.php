<?php
namespace App\Services\LiveActivities;

use App\Jobs\SendLiveActivityUpdate;
use App\Services\CloudComputer\Activity\{EventAuthority, HostEvents};
use App\Services\Notifications\Devices;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Cache, Crypt, DB};

/**
 * Live Activity cards for conversations running on the Cloud Host (docs/cloud-switching-contract.md section 2). A second
 * source beside Agent runs: the Dispatcher hands a card id here only when no `agent_runs` row owns it, so the Agent V2
 * path is untouched. The content state is the same fixed shape plus `source: 'cloud_host'`; the lock screen never gets
 * a conversation title, prompt or file name (a project name only when the person turned details on).
 */
final class CloudHostCards
{
    public const SOURCE = 'cloud_host';
    private const PHASE = ['running' => 'working', 'waiting' => 'needs_approval', 'finished' => 'finished', 'failed' => 'failed'];
    /** The attributes need an agent id; a card for the Cloud Host has none. */
    private const NO_AGENT = '00000000-0000-0000-0000-000000000000';
    private const START_COOLDOWN_SECONDS = 600;

    public function __construct(private readonly ApnsClient $apns, private readonly Preferences $prefs, private readonly Tokens $tokens) {}

    /** Whether this account has a conversation whose card this is (a phone may then register its activity token). */
    public function owns(int $user, string $cardId): bool
    {
        return DB::table(HostEvents::TABLE)->where('user_id', $user)->where('card_id', $cardId)->exists();
    }

    /** Called with each stored phase event: schedules one collapsed push carrying the latest state. Never throws. */
    public function onPhase(array $e): void
    {
        $stopped = $e['phase'] === 'stopped';
        if (!Dispatcher::enabled() || (!$stopped && !isset(self::PHASE[$e['phase']]))) return;
        $card = HostEvents::cardId((int) $e['user_id'], $e['provider'], $e['id']);
        // A stop is silent: it only matters to a card that is showing, and it never starts one.
        if ($stopped && !DB::table('live_activity_tokens')->where('run_id', $card)->whereNull('revoked_at')->whereNull('ended_at')->exists()) return;
        $urgent = $stopped || ContentState::needsPerson(self::PHASE[$e['phase']]) || ContentState::isEnd(self::PHASE[$e['phase']]);
        if (!$urgent && !Cache::add('live-activity:pending:'.$card, 1, 10)) return;
        $job = SendLiveActivityUpdate::dispatch($card)->afterCommit();
        if (!$urgent) $job->delay(now()->addSeconds((int) config('live_activities.coalesce_seconds', 2)));
    }

    /** Sends the conversation's current state to every card showing it, and starts one where a phone has none. */
    public function deliver(string $cardId): void
    {
        Cache::forget('live-activity:pending:'.$cardId);
        if (!$this->apns->enabled()) return;
        $latest = DB::table(HostEvents::TABLE)->where('card_id', $cardId)->whereIn('phase', HostEvents::PHASES)->orderByDesc('at')->orderByDesc('id')->first();
        if (!$latest || !app(EventAuthority::class)->deliveryCurrent($latest)) return;
        $user = (int) $latest->user_id;
        $prefs = $this->prefs->get($user);
        if (!$prefs['enabled']) return;
        // `stopped` has no content state: the card ends and goes at once, with no alert (the cancelled-run path).
        $content = $latest->phase === 'stopped' ? null : $this->content($latest, $prefs['details']);
        if ($latest->phase === 'running') $this->pushToStart($cardId, $user, $content, $latest);
        foreach (DB::table('live_activity_tokens')->where('run_id', $cardId)->whereNull('revoked_at')->whereNull('ended_at')->get() as $card) {
            $this->deliverTo($card, $content, $latest);
        }
    }

    /** @return array content state: phase, since, endedAt on an end, `source`, and the project only with details on */
    public function content(object $latest, bool $details): array
    {
        $phase = self::PHASE[$latest->phase];
        $turn = DB::table(HostEvents::TABLE)->where('card_id', $latest->card_id)->where('phase', 'running')->orderByDesc('at')->orderByDesc('id')->value('at');
        $state = ['phase' => $phase, 'since' => Carbon::parse($turn ?? $latest->at, 'UTC')->getTimestamp(), 'source' => self::SOURCE];
        if ($details) $state['project'] = mb_substr((string) $latest->project, 0, 40);
        if (ContentState::isEnd($phase)) $state['endedAt'] = Carbon::parse($latest->at, 'UTC')->getTimestamp();
        return $state;
    }

    private function deliverTo(object $card, ?array $content, object $event): void
    {
        $device = DB::table('notification_devices')->where('id', $card->device_id)->first();
        if (!$device || $device->generation !== $card->generation || !app(Devices::class)->eligible($device)) {
            $this->tokens->revokeToken($card->id);
            return;
        }
        $phase = $content['phase'] ?? 'stopped';
        if ($phase === $card->last_phase) return;
        [$payload, $priority] = $content === null ? [Payloads::remove(['phase' => 'failed', 'since' => time()]), 5] : Payloads::update($content, 'Vibyra Cloud');
        if (!app(EventAuthority::class)->deliveryCurrent($event)) return;
        $result = $this->apns->send(Crypt::decryptString($card->token), $payload, $priority, 0);
        if ($result['status'] === 200) {
            DB::table('live_activity_tokens')->where('id', $card->id)->update(['last_phase' => $phase, 'last_sent_at' => now(),
                'ended_at' => ($content === null || ContentState::isEnd($phase)) ? now() : null, 'updated_at' => now()]);
        } elseif ($result['status'] === 410 || in_array($result['reason'], ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'], true)) {
            $this->tokens->revokeToken($card->id);
        }
        // 429, 5xx or no answer: the next phase change sends the then-current state.
    }

    /** A conversation that began in Cloud starts a card on the account's phones (iOS 17.2+), within the phone's own limit. */
    private function pushToStart(string $cardId, int $user, array $content, object $event): void
    {
        $attributes = Payloads::attributes($cardId, self::NO_AGENT, 'Vibyra Cloud', 'assistant');
        $devices = DB::table('notification_devices')->where('user_id', $user)->whereNull('revoked_at')->whereNotNull('push_to_start_token')->get();
        foreach ($devices as $device) {
            if (!app(Devices::class)->eligible($device) || !app(EventAuthority::class)->deliveryCurrent($event)) continue;
            if (DB::table('live_activity_tokens')->where('device_id', $device->id)->where('run_id', $cardId)->whereNull('ended_at')->whereNull('revoked_at')->exists()) continue;
            $open = DB::table('live_activity_tokens')->where('device_id', $device->id)->whereNull('ended_at')->whereNull('revoked_at')->count();
            if ($open >= (int) config('live_activities.max_concurrent', 2)) continue;
            if (!Cache::add("live-activity:start:{$device->id}:$cardId", 1, self::START_COOLDOWN_SECONDS)) continue;
            $this->apns->send(Crypt::decryptString($device->push_to_start_token), Payloads::start($content, $attributes), 5, 0);
        }
    }
}
