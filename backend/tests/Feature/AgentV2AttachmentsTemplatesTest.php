<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Phase 8: v2 attachments (upload → admit by id → lease-fenced runner fetch) and starter teammates. */
class AgentV2AttachmentsTemplatesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        Storage::fake('local');
    }

    private function upload(UploadedFile $file)
    {
        return $this->post('/api/agents/v2/attachments', ['file' => $file], ['Accept' => 'application/json']);
    }

    public function test_an_uploaded_file_is_admitted_by_id_and_only_the_leased_runner_can_fetch_it(): void
    {
        $notes = $this->upload(UploadedFile::fake()->createWithContent('notes.md', "# Launch\nShip it."))->assertCreated()->json('attachment');
        $this->assertSame(['text', 'notes.md', 'text/plain', 17, hash('sha256', "# Launch\nShip it.")],
            [$notes['kind'], $notes['name'], $notes['mimeType'], $notes['size'], $notes['sha256']]);
        $photo = $this->upload(UploadedFile::fake()->image('shot.png', 2000, 1000))->assertCreated()->json('attachment');
        $this->assertSame(['image', 'image/jpeg'], [$photo['kind'], $photo['mimeType']]);
        $unused = $this->upload(UploadedFile::fake()->createWithContent('other.txt', 'not in this run'))->json('attachment');
        $run = $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-attach-1',
            'prompt' => 'Read my notes.', 'attachments' => [['id' => $notes['id']], ['id' => $photo['id']]]])->assertCreated()->json('run');
        $this->assertSame([$notes, $photo], $run['attachments']);
        $claimed = $this->claim();
        $this->assertSame($notes['id'], $claimed['attachments'][0]['id']);
        $path = fn ($id, $gen) => $this->runnerPath('/runs/'.$run['id'].'/attachments/'.$id.'?generation='.$gen);
        $fetched = $this->get($path($notes['id'], $claimed['generation']), $this->runnerHeaders())->assertOk();
        $this->assertSame("# Launch\nShip it.", $fetched->getContent());
        $this->assertStringStartsWith('text/plain', $fetched->headers->get('Content-Type'));
        $this->assertSame('nosniff', $fetched->headers->get('X-Content-Type-Options'));
        $this->getJson($path($notes['id'], $claimed['generation'] + 1), $this->runnerHeaders())->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->getJson($path($unused['id'], $claimed['generation']), $this->runnerHeaders())->assertStatus(404);
        $this->getJson($path($notes['id'], $claimed['generation']))->assertStatus(403)->assertJsonPath('code', 'invalid_runner_key');
        // Replays with the same ids are the same request; unknown ids are refused before admission.
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-attach-1',
            'prompt' => 'Read my notes.', 'attachments' => [['id' => $notes['id']], ['id' => $photo['id']]]])->assertOk()->assertJsonPath('replayed', true);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-attach-2',
            'prompt' => 'x', 'attachments' => [['id' => (string) Str::uuid()]]])->assertStatus(422)->assertJsonPath('code', 'attachment_not_found');
    }

    public function test_unsupported_or_foreign_files_are_refused(): void
    {
        $this->upload(UploadedFile::fake()->createWithContent('tool.exe', "MZ\x90\x00binary"))->assertStatus(422);
        $this->upload(UploadedFile::fake()->create('big.pdf', 4096, 'application/pdf'))->assertStatus(422);
        $foreign = (string) Str::uuid();
        DB::table('agent_v2_attachments')->insert(['id' => $foreign, 'user_id' => \App\Models\User::factory()->create()->id,
            'kind' => 'text', 'mime' => 'text/plain', 'name' => 'x.txt', 'bytes' => 1, 'sha256' => str_repeat('a', 64),
            'path' => 'x', 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-attach-3',
            'prompt' => 'x', 'attachments' => [['id' => $foreign]]])->assertStatus(422)->assertJsonPath('code', 'attachment_not_found');
    }

    public function test_starter_templates_suggest_but_creating_one_saves_only_the_profile(): void
    {
        $this->gmailInstall('me@example.com');
        $templates = collect($this->getJson('/api/agents/v2/templates')->assertOk()->json('templates'))->keyBy('key');
        $this->assertSame(['inbox_triage', 'pr_shepherd', 'morning_brief', 'meeting_prep'], $templates->keys()->all());
        $inbox = $templates['inbox_triage'];
        $this->assertFalse($inbox['autoGrant']);
        $this->assertTrue($inbox['suggested']['providers'][0]['connected']);
        $this->assertSame(['gmail_search', 'gmail_read', 'gmail_send'], array_column($inbox['suggested']['providers'][0]['operations'], 'tool'));
        $this->assertSame('gmail.message', $inbox['suggested']['trigger']['kind']);
        $this->assertSame('weekly', $templates['morning_brief']['suggested']['schedule']['recurrence']['type']);
        $id = (string) Str::uuid();
        $grants = DB::table('agent_grants')->count();
        $made = $this->postJson('/api/agents/v2/templates/inbox_triage/teammates', ['id' => $id])->assertCreated();
        $this->assertSame(['Inbox triage', 'assistant', []], [$made->json('teammate.name'), $made->json('teammate.avatar'),
            $made->json('teammate.integrations')]);
        $this->postJson('/api/agents/v2/templates/inbox_triage/teammates', ['id' => $id])->assertCreated()
            ->assertJsonPath('teammate.id', $id);
        $this->assertSame(1, DB::table('agent_teammates')->where('id', $id)->count());
        $this->assertSame($grants, DB::table('agent_grants')->count());
        $this->assertSame(0, DB::table('agent_schedules')->count() + DB::table('agent_triggers')->count());
        $this->postJson('/api/agents/v2/templates/pr_shepherd/teammates', ['id' => (string) Str::uuid(), 'name' => 'Reviews'])
            ->assertCreated()->assertJsonPath('teammate.name', 'Reviews');
        $this->postJson('/api/agents/v2/templates/nope/teammates', ['id' => (string) Str::uuid()])
            ->assertStatus(404)->assertJsonPath('code', 'template_not_found');
    }
}
