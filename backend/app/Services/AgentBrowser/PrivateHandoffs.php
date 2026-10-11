<?php
namespace App\Services\AgentBrowser;

use App\Models\AgentV2\{BrowserHandoff, Connection, RuntimeBinding};
use App\Models\VibyraSession;
use App\Services\AgentRuns\Browser\{BrowserGrants, BrowserOrigins};
use Illuminate\Support\Facades\DB;

/** Private pixels and keystrokes are encrypted, short lived and never action results. */
final class PrivateHandoffs
{
    public function begin(RuntimeBinding $b, string $run, string $action, int $generation, string $origin): array
    {
        return DB::transaction(function () use ($b, $run, $action, $generation, $origin) {
            $a = PrivateAuthority::action($b, $run, $action, $generation);
            $connection = Connection::findOrFail($a->connection_id);
            abort_unless(BrowserOrigins::ofUrl($origin) === $origin && BrowserGrants::allows($connection, $origin), 422);
            $h = BrowserHandoff::where('action_id', $action)->first();
            if ($h) {
                abort_unless($h->generation === $generation && $h->origin === $origin, 409);
                PrivateAuthority::current($h);
            } else $h = BrowserHandoff::create(['user_id' => $b->user_id, 'runtime_id' => $b->id, 'run_id' => $run,
                'action_id' => $action, 'generation' => $generation, 'origin' => $origin, 'expires_at' => now()->addMinutes(15)])->fresh();
            return PrivateAuthority::payload($h);
        });
    }

    public function open(VibyraSession $s, string $id, int $revision): array
    {
        return DB::transaction(function () use ($s, $id, $revision) {
            $h = PrivateAuthority::owner($s, $id, false);
            if ($h->viewer_session_id === (string) $s->id) return PrivateAuthority::payload($h);
            abort_unless($h->revision === $revision && $h->viewer_session_id === null && $h->state === 'waiting', 409,
                'Another device took control of this private browser.');
            $h->forceFill(['viewer_session_id' => (string) $s->id, 'state' => 'active', 'revision' => $h->revision + 1])->save();
            return PrivateAuthority::payload($h);
        });
    }

    public function frame(VibyraSession $s, string $id): array
    {
        return DB::transaction(function () use ($s, $id) {
            $h = PrivateAuthority::owner($s, $id);
            return ['handoff' => PrivateAuthority::payload($h), 'frame' => $h->frame];
        });
    }

    public function input(VibyraSession $s, string $id, array $d): array
    {
        return DB::transaction(function () use ($s, $id, $d) {
            $h = PrivateAuthority::owner($s, $id);
            abort_unless($h->state === 'active' && $h->revision === $d['expectedRevision']
                && $h->frame_sequence === $d['frameSequence'] && $h->frame_sequence > 0
                && $h->command_sequence === $h->acknowledged_sequence && $d['sequence'] === $h->command_sequence + 1,
                409, 'Private browser input changed or has not been confirmed. Refresh before another action.');
            $command = PrivateInputs::validate($d['command'], $h->frame ?? []);
            if ($command['kind'] === 'close') {
                app(\App\Services\AgentRuns\Runs::class)->cancel($s->user_id, $h->run_id);
                $h->forceFill(['state' => 'closed', 'frame' => null, 'command' => null, 'revision' => $h->revision + 1])->save();
            } else $h->forceFill(['command' => $command, 'command_sequence' => $d['sequence'], 'revision' => $h->revision + 1,
                'state' => $command['kind'] === 'resume' ? 'resuming' : 'active'])->save();
            return PrivateAuthority::payload($h);
        });
    }

    public function exchange(RuntimeBinding $b, string $id, array $d): array
    {
        return DB::transaction(function () use ($b, $id, $d) {
            $h = PrivateAuthority::helper($b, $id, $d['generation']);
            $ack = $d['acknowledgedSequence'];
            abort_unless($ack >= $h->acknowledged_sequence && $ack <= $h->command_sequence
                && ($ack === $h->acknowledged_sequence || $h->command === null), 409, 'Private input acknowledgement changed.');
            if ($ack > $h->acknowledged_sequence) {
                $h->acknowledged_sequence = $ack;
                if ($h->state === 'resuming') {
                    $h->forceFill(['state' => 'resumed', 'frame' => null, 'command' => null])->save();
                    return ['handoff' => PrivateAuthority::payload($h), 'command' => null];
                }
            }
            if (isset($d['frame']) && $h->state === 'active') {
                abort_unless($d['frameSequence'] === $h->frame_sequence + 1, 409, 'Private frame sequence changed.');
                $h->frame = PrivateInputs::frame($d['frame']);
                $h->frame_sequence = $d['frameSequence'];
            }
            $command = $h->command;
            // Claim before delivery. A lost response can never replay a click, key or submission.
            $h->command = null;
            $h->save();
            return ['handoff' => PrivateAuthority::payload($h), 'command' => $command === null ? null
                : ['sequence' => $h->command_sequence, 'input' => $command]];
        });
    }

    public function list(VibyraSession $s): array
    {
        $ids = BrowserHandoff::where('user_id', $s->user_id)->whereIn('state', ['waiting', 'active', 'resuming'])
            ->where('expires_at', '>', now())->orderBy('created_at')->limit(10)->pluck('id');
        return $ids->map(function ($id) use ($s) {
            try { return DB::transaction(fn () => PrivateAuthority::payload(PrivateAuthority::owner($s, $id, false))); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException) { return null; }
        })->filter()->values()->all();
    }
}
