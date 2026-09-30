<?php

namespace Tests\Feature;

use App\Services\Agents\BranchPublication\{Manifest, Publisher};
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AgentBranchPublisherTest extends TestCase
{
    private const WORKSPACE = '123e4567-e89b-12d3-a456-426614174000';
    private const BASE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    private const TREE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    private const NEW_TREE = 'cccccccccccccccccccccccccccccccccccccccc';
    private const COMMIT = 'dddddddddddddddddddddddddddddddddddddddd';

    protected function setUp(): void
    {
        parent::setUp();
        config(['agents.git_publish_enabled' => true]);
        Http::preventStrayRequests();
    }

    private function manifest(): array
    {
        $content = "after\n";
        $branch = 'vibyra-agent/'.self::WORKSPACE;
        $file = ['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null,
            'sha256' => hash('sha256', $content), 'mode' => '100644', 'bytes' => strlen($content),
            'contentBase64' => base64_encode($content)];
        return Manifest::validate(['baseSha' => self::BASE, 'branch' => $branch, 'files' => [$file],
            'snapshotSha256' => Manifest::digest(self::BASE, $branch, [$file])], self::WORKSPACE);
    }

    private function fakeGithub(array $options = []): void
    {
        $baseReads = 0;
        Http::fake(function ($request) use ($options, &$baseReads) {
            $url = $request->url(); $method = $request->method();
            if ($method === 'GET' && str_ends_with($url, '/git/ref/heads/main')) {
                $baseReads++;
                return Http::response(['ref' => 'refs/heads/main', 'object' => ['type' => 'commit',
                    'sha' => !empty($options['moveBaseAfter']) && $baseReads > 1
                        ? str_repeat('e', 40) : ($options['baseSha'] ?? self::BASE)]]);
            }
            if ($method === 'GET' && str_contains($url, '/git/ref/heads/vibyra-agent/')) {
                return isset($options['headSha']) ? Http::response(['ref' => 'refs/heads/vibyra-agent/'.self::WORKSPACE,
                    'object' => ['type' => 'commit', 'sha' => $options['headSha']]]) : Http::response([], 404);
            }
            if ($method === 'GET' && str_ends_with($url, '/git/commits/'.self::BASE)) {
                return Http::response(['sha' => self::BASE, 'tree' => ['sha' => self::TREE]]);
            }
            if ($method === 'POST' && str_ends_with($url, '/git/blobs')) return Http::response([
                'sha' => $options['blobSha'] ?? sha1("blob 6\0after\n")], 201);
            if ($method === 'POST' && str_ends_with($url, '/git/trees')) return Http::response([
                'sha' => self::NEW_TREE], 201);
            if ($method === 'POST' && str_ends_with($url, '/git/commits')) return Http::response([
                'sha' => self::COMMIT, 'message' => 'Fix login', 'tree' => ['sha' => self::NEW_TREE],
                'parents' => [['sha' => self::BASE]]], 201);
            if ($method === 'POST' && str_ends_with($url, '/git/refs')) return Http::response([
                'ref' => 'refs/heads/vibyra-agent/'.self::WORKSPACE,
                'object' => ['type' => 'commit', 'sha' => self::COMMIT]], 201);
            return Http::response([], 404);
        });
    }

    private function publish(): array
    {
        return app(Publisher::class)->publish('fixture-token', 'fixture/repo', 'main',
            'Fix login', $this->manifest());
    }

    public function test_exact_snapshot_creates_objects_then_one_branch_ref(): void
    {
        $this->fakeGithub();
        $result = $this->publish();
        $this->assertTrue($result['published']);
        $this->assertSame(self::COMMIT, $result['headSha']);
        $requests = Http::recorded()->map(fn ($row) => $row[0]);
        $this->assertSame(['GET', 'GET', 'GET', 'POST', 'POST', 'POST', 'GET', 'GET', 'POST'],
            $requests->map(fn ($r) => $r->method())->all());
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/blobs')
            && $r->data() === ['content' => base64_encode("after\n"), 'encoding' => 'base64']);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/trees')
            && $r->data()['base_tree'] === self::TREE
            && $r->data()['tree'][0] === ['path' => 'notes.txt', 'mode' => '100644',
                'type' => 'blob', 'sha' => sha1("blob 6\0after\n")]);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/git/refs')
            && $r->data() === ['ref' => 'refs/heads/vibyra-agent/'.self::WORKSPACE, 'sha' => self::COMMIT]);
        $this->assertSame(1, $requests->filter(fn ($r) => str_ends_with($r->url(), '/git/refs'))->count());
    }

    public function test_moved_base_or_existing_agent_branch_refuses_without_writes(): void
    {
        foreach ([['baseSha' => str_repeat('e', 40)], ['headSha' => str_repeat('f', 40)]] as $option) {
            $this->fakeGithub($option);
            $result = $this->publish();
            $this->assertTrue($result['refused']);
            Http::assertNotSent(fn ($r) => $r->method() === 'POST');
            Http::fake();
        }
    }

    public function test_wrong_blob_receipt_never_creates_a_branch(): void
    {
        $this->fakeGithub(['blobSha' => str_repeat('f', 40)]);
        $result = $this->publish();
        $this->assertArrayHasKey('error', $result);
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/refs'));
    }

    public function test_base_move_after_object_creation_refuses_before_visible_branch(): void
    {
        $this->fakeGithub(['moveBaseAfter' => true]);
        $result = $this->publish();
        $this->assertTrue($result['refused']);
        $this->assertSame(2, Http::recorded(fn ($r) => $r->method() === 'GET'
            && str_ends_with($r->url(), '/git/ref/heads/main'))->count());
        Http::assertNotSent(fn ($r) => str_ends_with($r->url(), '/git/refs'));
    }

    public function test_overlapping_file_and_directory_paths_refuse_before_network(): void
    {
        $manifest = $this->manifest();
        $manifest['files'] = [
            ['path' => 'dir', 'status' => '??', 'previousPath' => null, 'sha256' => hash('sha256', 'new'),
                'mode' => '100644', 'bytes' => 3, 'content' => 'new'],
            ['path' => 'dir/old.txt', 'status' => ' D', 'previousPath' => null,
                'sha256' => null, 'mode' => null, 'bytes' => 0, 'content' => null],
        ];
        $result = app(Publisher::class)->publish('fixture-token', 'fixture/repo', 'main', 'Fix login', $manifest);
        $this->assertTrue($result['refused']);
        Http::assertNothingSent();
    }

    public function test_unconfirmed_ref_post_is_unknown_and_never_retried(): void
    {
        $posts = 0;
        $this->fakeGithub();
        Http::fake(function ($request) use (&$posts) {
            if (str_ends_with($request->url(), '/git/refs')) {
                $posts++;
                throw new ConnectionException('fixture disconnect after branch creation');
            }
            return null;
        });
        $result = $this->publish();
        $this->assertArrayHasKey('error', $result);
        $this->assertSame(self::COMMIT, $result['commitSha']);
        $this->assertSame(1, $posts);
    }

    public function test_default_off_refuses_before_network(): void
    {
        config(['agents.git_publish_enabled' => false]);
        try { $this->publish(); $this->fail(); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
        Http::assertNothingSent();
    }
}
