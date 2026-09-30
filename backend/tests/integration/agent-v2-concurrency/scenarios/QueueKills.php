<?php
use Illuminate\Support\Facades\DB;

/** Scenario 7b: a worker (or an approving process) is kill -9'd mid-job. What state is everything left in? Reported, not assumed. */
final class ConcQueueKills
{
    public static function run(): void
    {
        self::killedTurnWorker();
        self::killedDeliveryWorker();
        self::killedApproval();
    }

    private static function artisan(array $args): string
    {
        return implode(' | ', array_map(fn ($r) => $r['out'], ConcRace::artisans(1, $args)));
    }

    private static function killedTurnWorker(): void
    {
        $w = new ConcWorkers;
        try {
            $w->start(['DB_QUEUE_RETRY_AFTER' => '12']); $w->start(['DB_QUEUE_RETRY_AFTER' => '12']);
            sleep(2);
            [$user, $id, $marker] = ConcWorkers::turn(true);
            $call = ConcWorkers::awaitInFlight('OPENROUTER', $marker, 30);
            $call ? posix_kill($call->pid, SIGKILL) : null;
            usleep(500000);
            $turn = DB::table('vibes_turns')->find($id);
            $job = DB::table('jobs')->where('payload', 'like', '%'.$id.'%')->first();
            Conc::check('worker kill -9 during a Vibes turn\'s provider call: turn is left running (unsettled), job still reserved',
                $call && $turn->status === 'running' && $turn->settled_at === null && $job && $job->reserved_at !== null, 'turn='.$turn->status.' job reserved='.json_encode($job?->reserved_at !== null).' attempts='.($job->attempts ?? '?'));
            sleep(16); // past retry_after: the surviving worker sees the expired reservation
            $failed = DB::table('failed_jobs')->where('payload', 'like', '%'.$id.'%')->count();
            $calls = ConcFakes::count('OPENROUTER', $marker);
            Conc::check('…after retry_after a surviving worker does NOT re-run it (tries=1 → MaxAttemptsExceeded → failed_jobs); the provider was called once, never twice',
                $failed === 1 && $calls === 1 && DB::table('jobs')->where('payload', 'like', '%'.$id.'%')->count() === 0, 'failed_jobs rows='.$failed.' provider calls='.$calls);
        } finally { $w->stopAll(); }
        DB::table('vibes_turns')->where('id', $id)->update(['updated_at' => now()->subMinutes(20)]);
        $out = self::artisan(['vibyra:recover-vibes']);
        $turn = DB::table('vibes_turns')->find($id);
        Conc::check('…`vibyra:recover-vibes` settles the stuck turn as uncertain (never replays the provider call): status '.$turn->status, $turn->settled_at !== null && ConcFakes::count('OPENROUTER', $marker) === 1,
            'status='.$turn->status.' error="'.substr((string) $turn->error, 0, 80).'" charged='.$turn->charged.'; recovery waits until the turn is >15 min old (900 s) when no generation id exists');
    }

    private static function killedDeliveryWorker(): void
    {
        $w = new ConcWorkers;
        try {
            $w->start(['DB_QUEUE_RETRY_AFTER' => '12', 'CONC_EXPO_STALL_MS' => '30000']);
            sleep(2);
            [, , $delivery, $item] = ConcWorkers::completedRun();
            $call = ConcWorkers::awaitInFlight('EXPO_PUSH', $item, 30);
            $call ? posix_kill($call->pid, SIGKILL) : null;
            usleep(500000);
            $state = DB::table('notification_deliveries')->where('id', $delivery)->value('state');
            Conc::check('worker kill -9 mid push delivery: the outbox row stays "sending" (the alert may or may not have reached Expo)', $call && $state === 'sending', 'delivery='.$state.' pushes recorded='.ConcFakes::count('EXPO_PUSH', $item));
            $w->start(['DB_QUEUE_RETRY_AFTER' => '12']);
            sleep(16);
            $pushes = ConcFakes::count('EXPO_PUSH', $item);
            Conc::check('…a replacement worker does not re-send it (job fails MaxAttemptsExceeded); still exactly one push', $pushes === 1 && DB::table('notification_deliveries')->where('id', $delivery)->value('state') === 'sending', 'pushes='.$pushes);
        } finally { $w->stopAll(); }
        DB::table('notification_deliveries')->where('id', $delivery)->update(['claimed_at' => now()->subMinutes(3)]);
        self::artisan(['vibyra:observe-work']);
        $row = DB::table('notification_deliveries')->find($delivery);
        Conc::check('…`vibyra:observe-work` ends it as failed/DeliveryUnconfirmed after 2 min and never re-queues it (at-most-once push; no retry of a possibly-sent alert)',
            $row->state === 'failed' && $row->error === 'DeliveryUnconfirmed' && ConcFakes::count('EXPO_PUSH', $item) === 1, 'state='.$row->state.' error='.$row->error.' pushes='.ConcFakes::count('EXPO_PUSH', $item));
    }

    private static function killedApproval(): void
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Email the board.');
        $c = ConcFixture::claim($fx);
        $a = ConcFixture::write($fx, $c, ['to' => 'board@example.com', 'subject' => 'S', 'body' => 'B'], 'send-1');
        $race = ConcRace::start([['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/decision', 'token' => $fx['token'],
            'json' => ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']]], 0, ['CONC_SEND_DELAY_MS' => '30000'])->release();
        $call = ConcWorkers::awaitInFlight('GMAIL_SEND', 'tok-'.$fx['user'], 30);
        $race->kill(0);
        $race->results(10);
        $row = DB::table('agent_tool_actions')->find($a['id']);
        $run = DB::table('agent_runs')->find($c['id']);
        Conc::check('API process kill -9 while executing an approved Gmail send: action stays "dispatching", run keeps running; nothing on the server sweeps it', $call && $row->state === 'dispatching' && $run->state === 'running',
            'action='.$row->state.' run='.$run->state.' sends='.ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']));
        $again = ConcHttp::call('POST', '/api/agents/v2/actions/'.$a['id'].'/decision', $fx['token'], ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']);
        $done = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/complete', ['generation' => $c['generation'], 'answer' => 'Sent.']);
        Conc::check('…a retried approval and a runner /complete are refused (no second send; actions_open), so the write is never repeated', $again['status'] === 200 && ($again['json']['action']['state'] ?? '') === 'dispatching'
            && $done['status'] === 409 && ($done['json']['code'] ?? '') === 'actions_open' && ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 1, 'retry='.$again['status'].' complete='.$done['status'].' '.($done['json']['code'] ?? ''));
        $fail = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/fail', ['generation' => $c['generation'], 'code' => 'runner_error', 'reason' => 'The Mac gave up waiting for the approved send.']);
        $final = DB::table('agent_runs')->find($c['id']);
        Conc::check('…the runner giving up (/fail) ends the run outcome_unknown, not completed or failed (honest "unknown outcome")', $fail['status'] === 200 && $final->state === 'outcome_unknown'
            && DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'run.outcome_unknown')->count() === 1, 'run='.$final->state.' reason='.$final->state_reason);
    }
}
