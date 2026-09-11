<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\{Attachments, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Cache, DB, Http, Storage};
use Illuminate\Support\Str;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

/**
 * Photos and files have to survive the whole path - upload, quote, encrypted
 * request, queued job - and reach OpenRouter's body as the content itself, while
 * the quote and the stored request only ever hold references.
 */
class VibesAttachmentsTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    private const SEES = 'openai/gpt-sight-test';
    private const BLIND = 'qwen/qwen3.8-flash';
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
        Storage::fake('local');
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            // Priced like a flagship ($10 per million input tokens) so a photo's bound shows
            // up in whole Vibes: 2,000 tokens is $0.022 with the margin, about two Vibes.
            self::SEES => ['pricing' => ['prompt' => '0.00001', 'completion' => '0.00003'], 'supported_parameters' => ['tools'],
                'input_modalities' => ['text', 'image', 'file'], 'output_modalities' => ['text']],
            self::BLIND => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools'],
                'input_modalities' => ['text'], 'output_modalities' => ['text']],
        ]]);
        $this->user = $this->signIn('vibes-attachments-session');
    }

    private function signIn(string $token, bool $consent = true): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'iPhone']);
        $this->withToken($token);
        $this->getJson('/api/vibes/wallet')->assertOk();
        app(Wallet::class)->grant($user->id, 'test-topup-'.$token, 'topup', 500);
        if ($consent) $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();

        return $user;
    }

    private function chat(): string
    {
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $id, 'title' => 'Look at this'])->assertOk();

        return $id;
    }

    private function upload(UploadedFile $file): array
    {
        return $this->postJson('/api/vibes/attachments', ['file' => $file])->assertCreated()->json('attachment');
    }

    private function quote(string $chat, string $model, array $attachments, string $text = 'What is wrong here?')
    {
        return $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => $text, 'model' => $model, 'attachments' => $attachments]);
    }

    /** Sends the quoted turn through the real job and returns the body OpenRouter received. */
    private function send(array $quote): array
    {
        Http::fake(['*' => Http::response(['id' => 'gen-1', 'usage' => ['cost' => 0.003],
            'choices' => [['message' => ['content' => 'The button is misaligned.']]]])]);
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        app()->call([new RunVibesTurn($id), 'handle']);
        $sent = null;
        Http::assertSent(function ($request) use (&$sent) { $sent = $request->data(); return true; });

        return ['id' => $id, 'body' => $sent];
    }

    public function test_a_photo_is_re_encoded_small_and_reaches_the_model_as_the_image_itself(): void
    {
        $photo = $this->upload(UploadedFile::fake()->image('screen.png', 3000, 2000));
        $this->assertSame('image', $photo['kind']);
        $row = DB::table('vibes_attachments')->where('id', $photo['id'])->first();
        // Re-encoded, which bounds the price and drops the photo's location data.
        [$width, $height, $type] = getimagesizefromstring(Storage::disk('local')->get($row->path));
        $this->assertSame([1280, 853, IMAGETYPE_JPEG], [$width, $height, $type]);
        $this->assertSame(Attachments::IMAGE_TOKENS, (int) $row->tokens);

        $chat = $this->chat();
        $bare = $this->quote($chat, self::SEES, [])->assertOk()->json();
        $quote = $this->quote($chat, self::SEES, [$photo['id']])->assertOk()->json();
        $this->assertGreaterThanOrEqual($bare['maxCredits'] + 2, $quote['maxCredits'], 'The photo is priced into the quote');
        // The quote carries a reference, never the bytes.
        $this->assertLessThan(8000, strlen($quote['quote']));

        ['id' => $turn, 'body' => $body] = $this->send($quote);
        $content = end($body['messages'])['content'];
        $this->assertSame(['type' => 'text', 'text' => 'What is wrong here?'], $content[0]);
        $this->assertStringStartsWith('data:image/jpeg;base64,', $content[1]['image_url']['url']);
        // What is stored for the turn is still the reference.
        $this->assertStringNotContainsString('base64', (string) DB::table('vibes_turns')->where('id', $turn)->value('request'));
        $this->assertSame([['id' => $photo['id'], 'kind' => 'image', 'name' => 'screen.png', 'bytes' => (int) $row->bytes]],
            $this->getJson('/api/vibes/turns/'.$turn)->assertOk()->json('turn.attachments'));
    }

    public function test_a_photo_needs_a_model_that_can_see_it(): void
    {
        $photo = $this->upload(UploadedFile::fake()->image('screen.jpg', 800, 600));
        $this->quote($this->chat(), self::BLIND, [$photo['id']])->assertStatus(422)
            ->assertJsonFragment(['message' => 'Qwen3.8 Flash cannot see photos. Choose Auto or a model that can.']);
    }

    public function test_auto_chooses_a_model_that_can_see_when_a_photo_is_attached(): void
    {
        // Two curated candidates; the blind one is far cheaper, so only the photo moves Auto.
        config(['vibes.models' => [self::BLIND => ['family' => 'Qwen', 'name' => 'Flash', 'tier' => 'fast'],
            self::SEES => ['family' => 'OpenAI', 'name' => 'Sight', 'tier' => 'best']], 'vibes.auto_model' => self::BLIND]);
        $chat = $this->chat();
        $this->assertSame(self::BLIND, $this->quote($chat, 'auto', [], 'Say hello')->assertOk()->json('model'));
        $photo = $this->upload(UploadedFile::fake()->image('screen.jpg', 800, 600));
        $this->assertSame(self::SEES, $this->quote($chat, 'auto', [$photo['id']], 'Say hello')->assertOk()->json('model'));
    }

    public function test_a_text_file_is_sent_as_its_text_and_a_pdf_is_read_without_the_paid_parser(): void
    {
        $notes = $this->upload(UploadedFile::fake()->createWithContent('notes.md', "# Plan\n- fix the header\n"));
        $this->assertSame('text', $notes['kind']);
        $pdf = $this->upload(UploadedFile::fake()->createWithContent('spec.pdf', "%PDF-1.4\n1 0 obj <</Type /Pages>>\n2 0 obj <</Type /Page>>\n3 0 obj <</Type /Page>>\n%%EOF"));
        $this->assertSame('pdf', $pdf['kind']);
        // Two page objects, counted without the /Pages tree node.
        $this->assertSame(3000, (int) DB::table('vibes_attachments')->where('id', $pdf['id'])->value('tokens'));

        $quote = $this->quote($this->chat(), self::SEES, [$notes['id'], $pdf['id']])->assertOk()->json();
        ['body' => $body] = $this->send($quote);
        $content = end($body['messages'])['content'];
        $this->assertSame("Attached file notes.md:\n```\n# Plan\n- fix the header\n\n```", $content[1]['text']);
        $this->assertSame('spec.pdf', $content[2]['file']['filename']);
        $this->assertStringStartsWith('data:application/pdf;base64,', $content[2]['file']['file_data']);
        $this->assertSame([['id' => 'file-parser', 'pdf' => ['engine' => 'pdf-text']]], $body['plugins']);
    }

    public function test_an_attachment_is_one_account_s_and_goes_with_one_message(): void
    {
        $photo = $this->upload(UploadedFile::fake()->image('mine.jpg', 400, 300));
        $chat = $this->chat();
        $this->send($this->quote($chat, self::SEES, [$photo['id']])->assertOk()->json());
        // Sent once, it is part of that turn and cannot be priced into another.
        $this->quote($chat, self::SEES, [$photo['id']])->assertStatus(422);

        $theirs = $this->upload(UploadedFile::fake()->image('theirs.jpg', 400, 300));
        $this->signIn('someone-else');
        $this->quote($this->chat(), self::SEES, [$theirs['id']])->assertStatus(422);
    }

    public function test_a_reference_typed_into_a_message_is_never_expanded(): void
    {
        $theirs = $this->upload(UploadedFile::fake()->image('private.jpg', 400, 300));
        $this->signIn('curious-account');
        $typed = 'vibyra-attachment:'.$theirs['id'];
        ['body' => $body] = $this->send($this->quote($this->chat(), self::SEES, [], $typed)->assertOk()->json());
        $this->assertSame($typed, end($body['messages'])['content']);
    }

    public function test_uploads_need_consent_a_readable_file_and_a_size_the_server_accepts(): void
    {
        $this->signIn('no-consent-yet', consent: false);
        $this->postJson('/api/vibes/attachments', ['file' => UploadedFile::fake()->image('a.jpg')])->assertForbidden();
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $this->postJson('/api/vibes/attachments', ['file' => UploadedFile::fake()->createWithContent('archive.zip', "PK\x03\x04binary")])
            ->assertStatus(422)->assertJsonFragment(['message' => 'Attach a photo, a PDF or a text file.']);
        $this->postJson('/api/vibes/attachments', ['file' => UploadedFile::fake()->create('big.pdf', 3000, 'application/pdf')])
            ->assertStatus(422)->assertJsonFragment(['file' => ['Attach a file under 2 MB.']]);
    }
}
