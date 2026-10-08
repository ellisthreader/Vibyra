<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Connection, Run, ToolAction};
use App\Services\AgentRuns\{Retention, RunAttachments};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Crypt, DB, Http, Storage};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

final class AgentStageTwoEmailEnvelopeTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void { parent::setUp(); $this->bootV2(); Storage::fake('local'); }
    private function sender(string $email, string $token = 'second-token'): string
    {
        return Connection::query()->create(['user_id' => $this->user->id, 'provider' => 'gmail', 'external_identity' => $email,
            'credential' => Crypt::encryptString($token), 'health' => 'healthy', 'generation' => 1])->id;
    }
    private function prepare(bool $two = true): array
    {
        $first = $this->gmailInstall('sender@example.com'); $this->grant($first, ['gmail_send']);
        $second = $this->sender('second@example.com');
        if ($two) $this->grant($second, ['gmail_send']);
        $this->admit('Prepare email'); $run = $this->claim();
        $args = ['to' => 'recipient@example.test', 'subject' => 'Reviewed email', 'body' => 'Exact body'];
        $a = $this->callTool($run, 'gmail_send', $first, $args, 'email-call')->assertOk()->json('action');
        $draft = $this->getJson('/api/agents/v2/actions/'.$a['id'].'/draft')->assertOk()->json('draft');
        return [$draft, $first, $second, $run, $args];
    }
    private function upload(string $name = 'notes.txt', string $bytes = 'Exact attachment bytes'): array
    {
        return app(RunAttachments::class)->store($this->user->id, UploadedFile::fake()->createWithContent($name, $bytes));
    }
    private function edit(array $d, array $extra = [])
    {
        return $this->patchJson('/api/agents/v2/actions/'.$d['id'].'/draft', ['revision' => $d['revision'],
            'fingerprint' => $d['fingerprint'], 'arguments' => array_intersect_key($d['arguments'], array_flip(['to', 'subject', 'body'])), ...$extra]);
    }
    private function send(array $d)
    {
        return $this->postJson('/api/agents/v2/actions/'.$d['id'].'/decision', ['fingerprint' => $d['fingerprint'], 'decision' => 'allow']);
    }

    public function test_sender_change_is_reviewed_replay_safe_and_uses_only_that_accounts_credential(): void
    {
        [$old, $first, $second, $run, $args] = $this->prepare();
        $this->assertCount(2, $old['senders']);
        $new = $this->edit($old, ['connectionId' => $second])->assertOk()->json('draft');
        $this->assertSame('second@example.com', $new['account']);
        $this->assertNotSame($old['fingerprint'], $new['fingerprint']);
        $this->send($old)->assertStatus(409);
        $this->callTool($run, 'gmail_send', $first, $args, 'email-call')->assertOk()->assertJsonPath('action.id', $old['id']);
        $this->fakeGmail(['second-token' => []]);
        $this->send($new)->assertOk()->assertJsonPath('action.state', 'completed');
        $this->send($new)->assertOk();
        $sends = Http::recorded(fn ($r) => str_ends_with($r->url(), '/messages/send'));
        $this->assertCount(1, $sends);
        $this->assertSame('Bearer second-token', $sends[0][0]->header('Authorization')[0]);
        $this->assertStringContainsString("From: second@example.com\r\n", base64_decode(strtr($sends[0][0]['raw'], '-_', '+/')));
    }

    public function test_newly_granted_wrong_owner_revoked_and_changed_senders_are_refused(): void
    {
        [$d, , $second] = $this->prepare(false);
        $this->assertCount(1, $d['senders']);
        $this->edit($d, ['connectionId' => $second])->assertStatus(409);
        $this->grant($second, ['gmail_send']);
        $this->edit($d, ['connectionId' => $second])->assertStatus(409); // Not admitted with this task.
        Http::assertNothingSent();
    }

    public function test_owned_attachments_are_hash_bound_and_encode_exact_bytes_and_safe_filenames(): void
    {
        [$old] = $this->prepare();
        $file = $this->upload("résumé\r\nBcc: injected@example.test.txt", 'Exact attachment bytes');
        $new = $this->edit($old, ['attachmentIds' => [$file['id']]])->assertOk()->json('draft');
        $this->assertSame($file['sha256'], $new['attachments'][0]['sha256']);
        $this->assertNotSame($old['fingerprint'], $new['fingerprint']);
        $this->send($old)->assertStatus(409);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->send($new)->assertOk()->assertJsonPath('action.state', 'completed');
        $sends = Http::recorded(fn ($r) => str_ends_with($r->url(), '/messages/send'));
        $mime = base64_decode(strtr($sends[0][0]['raw'], '-_', '+/'));
        $this->assertStringContainsString('multipart/mixed', $mime);
        $this->assertStringContainsString(base64_encode('Exact attachment bytes'), $mime);
        $this->assertStringContainsString(base64_encode('Exact body'), $mime);
        $this->assertStringNotContainsString("\r\nBcc:", $mime);
        $this->assertMatchesRegularExpression('/filename\*(?:0\*)?=UTF-8/', $mime);
    }

    #[DataProvider('damagedFiles')]
    public function test_missing_or_modified_attachment_refuses_before_any_provider_http(string $damage): void
    {
        [$d] = $this->prepare(); $file = $this->upload();
        $new = $this->edit($d, ['attachmentIds' => [$file['id']]])->assertOk()->json('draft');
        $path = DB::table('agent_v2_attachments')->where('id', $file['id'])->value('path');
        if ($damage === 'missing') Storage::disk('local')->delete($path);
        else Storage::disk('local')->put($path, 'Tampered bytes');
        $this->send($new)->assertOk()->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.reason', 'attachment_changed');
        Http::assertNothingSent();
    }

    public function test_other_owner_ids_duplicate_ids_raw_metadata_and_fifth_file_are_refused(): void
    {
        [$d] = $this->prepare(); $file = $this->upload();
        DB::table('agent_v2_attachments')->where('id', $file['id'])->update(['user_id' => \App\Models\User::factory()->create()->id]);
        $this->edit($d, ['attachmentIds' => [$file['id']]])->assertStatus(422);
        $this->edit($d, ['attachmentIds' => [$file['id'], $file['id']]])->assertStatus(422);
        $this->edit($d, ['attachmentIds' => array_fill(0, 5, $file['id'])])->assertStatus(422);
        $this->edit($d, ['arguments' => [...$d['arguments'], 'attachments' => [['path' => '/etc/passwd']]]])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_attachment_removal_changes_fingerprint_and_pending_draft_retains_late_upload(): void
    {
        [$d] = $this->prepare(); $file = $this->upload();
        $with = $this->edit($d, ['attachmentIds' => [$file['id']]])->assertOk()->json('draft');
        DB::table('agent_v2_attachments')->where('id', $file['id'])->update(['created_at' => now()->subDays(3)]);
        app(Retention::class)->prune();
        $this->assertDatabaseHas('agent_v2_attachments', ['id' => $file['id']]);
        $without = $this->edit($with, ['attachmentIds' => []])->assertOk()->json('draft');
        $this->assertSame([], $without['attachments']);
        $this->assertNotSame($with['fingerprint'], $without['fingerprint']);
        app(Retention::class)->prune();
        $this->assertDatabaseMissing('agent_v2_attachments', ['id' => $file['id']]);
    }
    public static function damagedFiles(): array { return [['missing'], ['modified']]; }
    public static function changedSenders(): array { return [['revoked'], ['generation'], ['grant'], ['owner']]; }

    #[DataProvider('changedSenders')]
    public function test_admitted_sender_is_removed_after_revoke_reconnect_grant_or_owner_change(string $change): void
    {
        [$draft, , $second] = $this->prepare();
        if ($change === 'revoked') Connection::query()->whereKey($second)->update(['revoked_at' => now()]);
        elseif ($change === 'generation') Connection::query()->whereKey($second)->increment('generation');
        elseif ($change === 'grant') DB::table('agent_grants')->where('connection_id', $second)->increment('revision');
        else Connection::query()->whereKey($second)->update(['user_id' => \App\Models\User::factory()->create()->id]);
        $this->getJson('/api/agents/v2/actions/'.$draft['id'].'/draft')->assertOk()->assertJsonCount(1, 'draft.senders');
        $this->edit($draft, ['connectionId' => $second])->assertStatus(409)->assertJsonPath('code', 'draft_access_changed');
        Http::assertNothingSent();
    }

    public function test_long_unicode_attachment_headers_are_folded_without_header_injection(): void
    {
        $name = str_repeat('é', 180).'.txt';
        $mime = app(\App\Services\AgentRuns\Tools\Providers\GmailMime::class)->build(
            ['to' => 'qa@example.test', 'subject' => 'Test', 'body' => 'Test'], '<fixture@vibyra.test>', 'from@example.test',
            [['name' => $name, 'mimeType' => 'text/plain', 'bytes' => 'content']]);
        $this->assertStringContainsString("filename*0*=UTF-8''", $mime);
        foreach (explode("\r\n", $mime) as $line) $this->assertLessThan(999, strlen($line));
    }

}
