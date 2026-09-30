<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Registry;
use App\Services\ChatConnectors\Figma\ReadTools;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class FigmaReadToolsTest extends TestCase
{
    public function test_selection_links_and_comment_threads_keep_their_identity(): void
    {
        $args = ReadTools::validate('figma_read_frame', ['file' => 'https://www.figma.com/design/ABCDEFGHIJKLMNOP/File?node-id=12%3A34']);
        $this->assertSame(['fileKey' => 'ABCDEFGHIJKLMNOP', 'nodeId' => '12:34'], $args);
        Http::fake(['api.figma.com/v1/files/*/comments' => Http::response(['comments' => [
            ['id' => 'child', 'parent_id' => 'parent', 'message' => 'Reply', 'user' => ['handle' => 'designer']],
        ]])]);
        $result = app(Registry::class)->for('figma')->run('figma_file_comments', ['fileKey' => 'ABCDEFGHIJKLMNOP'], 'test-token');
        $this->assertSame('parent', $result['result']['comments'][0]['parentId']);
        Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer test-token'));
    }

    public function test_missing_comments_are_not_reported_as_a_successful_empty_file(): void
    {
        Http::fake(['*' => Http::response(['message' => 'Unexpected response'])]);
        $result = app(Registry::class)->for('figma')->run('figma_file_comments', ['fileKey' => 'ABCDEFGHIJKLMNOP'], 'token');
        $this->assertArrayHasKey('error', $result['result']);
    }

    public function test_foreign_urls_and_invalid_selection_ids_are_rejected_before_http(): void
    {
        Http::fake();
        foreach (['https://notfigma.com/design/ABCDEFGHIJKLMNOP', 'https://example.com/figma.com/file/ABCDEFGHIJKLMNOP',
            'https://figma.com/design/ABCDEFGHIJKLMNOP?node-id=not-a-node'] as $url) {
            try {
                ReadTools::validate('figma_read_frame', ['file' => $url]);
                $this->fail('Invalid Figma selection was accepted');
            } catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        }
        Http::assertNothingSent();
    }

    public function test_provider_refusals_remain_errors_and_large_trees_report_partial_coverage(): void
    {
        $connector = app(Registry::class)->for('figma');
        $responses = Http::sequence();
        foreach ([401, 403, 404, 429, 500] as $status) $responses->push([], $status);
        $responses->push(['document' => ['id' => '0:0', 'children' => array_fill(0, 50,
            ['id' => '1:1', 'name' => 'Frame', 'type' => 'FRAME'])]]);
        Http::fake(['*' => $responses]);
        foreach ([401, 403, 404, 429, 500] as $status) {
            $result = $connector->run('figma_list_frames', ['fileKey' => 'ABCDEFGHIJKLMNOP'], 'token');
            $this->assertArrayHasKey('error', $result['result']);
            $this->assertSame($status, $result['result']['status']);
        }
        $result = $connector->run('figma_list_frames', ['fileKey' => 'ABCDEFGHIJKLMNOP'], 'token');
        $this->assertTrue($result['result']['truncated']);
        $this->assertCount(40, $result['result']['node']['children']);
    }
}
