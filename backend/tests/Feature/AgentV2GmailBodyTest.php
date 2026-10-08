<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\GmailTools;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Provider-shaped MIME fixtures; these are not live Gmail delivery evidence. */
class AgentV2GmailBodyTest extends TestCase
{
    private const URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/msg00001';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function text(string $mime, string $text, array $extra = []): array
    {
        return $extra + ['mimeType' => $mime, 'body' => ['data' => rtrim(strtr(base64_encode($text), '+/', '-_'), '=')]];
    }

    private function read(array $payload, int $start = 0): array
    {
        Http::fake([self::URL.'?*' => Http::response(['id' => 'msg00001', 'payload' => $payload])]);
        return app(GmailTools::class)->run('gmail_read', ['id' => 'msg00001', 'startChar' => $start], 'named-account-token', 'read')['result'];
    }

    public function test_html_only_email_is_read_without_script_style_or_network_execution(): void
    {
        $result = $this->read($this->text('text/html', '<html><head><style>hide me</style></head><body>'
            .'<p>Hello &amp; welcome</p><p>Résumé £9</p><script>sendSecrets()</script><img src="https://attacker.test/pixel"></body></html>'));
        $this->assertStringContainsString("Hello & welcome\nRésumé £9", $result['body']);
        $this->assertStringNotContainsString('sendSecrets', $result['body']);
        $this->assertStringNotContainsString('hide me', $result['body']);
        $this->assertTrue($result['bodyComplete']);
        Http::assertSentCount(1);
    }

    public function test_plain_alternative_wins_even_when_html_appears_first(): void
    {
        $result = $this->read(['mimeType' => 'multipart/alternative', 'parts' => [
            $this->text('text/html', '<p>HTML version</p>'), $this->text('text/plain', 'Plain version')]]);
        $this->assertSame('Plain version', $result['body']);
        $this->assertTrue($result['bodyComplete']);
    }

    public function test_inline_parts_are_combined_but_file_attachments_are_explicitly_omitted(): void
    {
        $result = $this->read(['mimeType' => 'multipart/mixed', 'parts' => [
            $this->text('text/plain', 'First'), $this->text('text/plain', 'Second'),
            $this->text('text/plain', 'Not the message', ['filename' => 'private.txt'])]]);
        $this->assertSame("First\n\nSecond", $result['body']);
        $this->assertFalse($result['bodyComplete']);
        $this->assertSame(['File attachments are not included in the message body.'], $result['bodyOmissions']);
    }

    public function test_external_text_body_uses_only_the_same_message_and_account_then_pages_unicode(): void
    {
        Http::fake([self::URL.'/attachments/body-id' => Http::response(['data' => base64_encode(str_repeat('é', 12000).'TAIL')])]);
        $result = $this->read(['mimeType' => 'text/plain', 'body' => ['attachmentId' => 'body-id', 'size' => 24004]], 12000);
        $this->assertSame('TAIL', $result['body']);
        $this->assertSame(12004, $result['bodyChars']);
        $this->assertFalse($result['truncated']);
        $this->assertTrue($result['bodyComplete']);
        Http::assertSent(fn ($r) => $r->url() === self::URL.'/attachments/body-id'
            && $r->hasHeader('Authorization', 'Bearer named-account-token'));
    }

    public function test_legacy_character_encoding_is_converted_to_utf8(): void
    {
        $result = $this->read($this->text('text/plain', "Caf\xe9", ['headers' => [
            ['name' => 'Content-Type', 'value' => 'text/plain; charset="ISO-8859-1"']]]));
        $this->assertSame('Café', $result['body']);
        $this->assertTrue($result['bodyComplete']);
    }

    public function test_oversized_external_body_is_not_downloaded_or_reported_as_complete(): void
    {
        $result = $this->read(['mimeType' => 'text/plain', 'body' => ['attachmentId' => 'huge', 'size' => 1000001]]);
        $this->assertSame('', $result['body']);
        $this->assertFalse($result['bodyComplete']);
        $this->assertNotEmpty($result['bodyOmissions']);
        Http::assertSentCount(1);
    }

    public function test_invalid_body_is_not_silently_reported_as_an_empty_complete_email(): void
    {
        $result = $this->read(['mimeType' => 'text/plain', 'body' => ['data' => '%%%invalid%%%']]);
        $this->assertSame('', $result['body']);
        $this->assertFalse($result['bodyComplete']);
    }

    public function test_deeply_nested_mime_is_bounded_and_reported_as_incomplete(): void
    {
        $payload = $this->text('text/plain', 'buried');
        for ($i = 0; $i < 20; $i++) $payload = ['mimeType' => 'multipart/mixed', 'parts' => [$payload]];
        $result = $this->read($payload);
        $this->assertSame('', $result['body']);
        $this->assertSame(['MIME structure limit reached.'], $result['bodyOmissions']);
    }
}
