<?php
namespace Tests\Unit;

use App\Services\Assistant\Body;
use GuzzleHttp\Psr7\{Response as PsrResponse, Utils};
use Illuminate\Http\Client\Response;
use PHPUnit\Framework\TestCase;

final class AssistantBodyTest extends TestCase
{
    public function test_delayed_headers_count_towards_deadline_and_stream_is_closed(): void
    {
        $stream = Utils::streamFor('data');
        $response = Body::mark(new Response(new PsrResponse(200, [], $stream)), 0);
        try { iterator_to_array(Body::chunks($response, 100, fn () => 91)); $this->fail('Deadline ignored'); }
        catch (\RuntimeException $e) { $this->assertSame('assistant_deadline', $e->getMessage()); }
        $this->assertFalse($stream->isReadable());
    }

    public function test_slow_chunks_cannot_extend_total_deadline(): void
    {
        $stream = Utils::streamFor(str_repeat('a', 20000));
        $response = Body::mark(new Response(new PsrResponse(200, [], $stream)), 0);
        $ticks = [0, 30, 60, 90]; $received = '';
        try {
            foreach (Body::chunks($response, 30000, function () use (&$ticks) { return array_shift($ticks); }) as $chunk) $received .= $chunk;
            $this->fail('Deadline ignored');
        } catch (\RuntimeException $e) { $this->assertSame('assistant_deadline', $e->getMessage()); }
        $this->assertSame(8192, strlen($received));
        $this->assertFalse($stream->isReadable());
    }

    public function test_normal_body_and_size_limit_close_stream(): void
    {
        $stream = Utils::streamFor('hello');
        $this->assertSame(['hello'], iterator_to_array(Body::chunks(new Response(new PsrResponse(200, [], $stream)), 5)));
        $this->assertFalse($stream->isReadable());
        $stream = Utils::streamFor('too much');
        try { iterator_to_array(Body::chunks(new Response(new PsrResponse(200, [], $stream)), 2)); $this->fail('Size ignored'); }
        catch (\RuntimeException $e) { $this->assertSame('assistant_stream_size', $e->getMessage()); }
        $this->assertFalse($stream->isReadable());
    }
}
