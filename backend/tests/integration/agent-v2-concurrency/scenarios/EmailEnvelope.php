<?php

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\{Grants, Retention, RunAttachments};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Crypt, DB, Storage};

/** A sender/file edit and the old approval can never combine into an unreviewed email. */
final class ConcEmailEnvelope
{
    public static function run(): void
    {
        Conc::$scenario = 'email envelope';
        $failures = [];
        for ($i = 0; $i < 6; $i++) {
            $fx = ConcFixture::make(true);
            $token = 'second-'.$fx['user'];
            $second = Connection::query()->create(['user_id' => $fx['user'], 'provider' => 'gmail', 'external_identity' => 'second@example.test',
                'credential' => Crypt::encryptString($token), 'generation' => 1, 'health' => 'healthy']);
            app(Grants::class)->put($fx['user'], $fx['agent'], $second, ['gmail_send']);
            ConcFixture::admit($fx, 'Prepare email'); $run = ConcFixture::claim($fx);
            $args = ['to' => 'qa@example.test', 'subject' => 'Review', 'body' => 'Reviewed email'];
            $a = ConcFixture::write($fx, $run, $args, 'email');
            $file = app(RunAttachments::class)->store($fx['user'], UploadedFile::fake()->createWithContent('owned.txt', 'Exact owned file'));
            $path = DB::table('agent_v2_attachments')->where('id', $file['id'])->value('path');
            $edit = ['op' => 'call', 'method' => 'PATCH', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/draft', 'token' => $fx['token'],
                'json' => ['revision' => 1, 'fingerprint' => $a['fingerprint'], 'arguments' => $args, 'connectionId' => $second->id, 'attachmentIds' => [$file['id']]]];
            $approve = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/decision', 'token' => $fx['token'],
                'json' => ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']];
            try {
                $t = Conc::tally(ConcRace::run([$edit, $approve]));
                $row = DB::table('agent_tool_actions')->find($a['id']);
                $oldSends = ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']); $newSends = ConcFakes::count('GMAIL_SEND', $token);
                $sent = $row->state === 'completed' && (int) $row->draft_revision === 1 && $row->connection_id === $fx['gmail']
                    && $oldSends === 1 && $newSends === 0 && ($t['409:draft_closed'] ?? 0) === 1;
                $edited = $row->state === 'pending_approval' && (int) $row->draft_revision === 2 && $row->connection_id === $second->id
                    && $oldSends === 0 && $newSends === 0 && ($t['409:stale_fingerprint'] ?? 0) === 1;
                if ($edited) {
                    ConcFixture::ok(ConcHttp::call('POST', $approve['uri'], $fx['token'], ['fingerprint' => $row->fingerprint, 'decision' => 'allow']), 200);
                    $edited = ConcFakes::count('GMAIL_SEND', $token) === 1 && ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 0;
                }
                if (!$sent && !$edited) $failures[] = [$t, $row->state, $oldSends, $newSends];
            } finally { Storage::disk(Retention::disk())->delete($path); }
        }
        Conc::check('six sender+attachment edit versus send races never combine old approval with new envelope', !$failures, json_encode($failures));
    }
}
