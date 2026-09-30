<?php

namespace Tests\Feature;

use App\Services\Agents\BranchPublication\Manifest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Branch publish + draft PR from a Mac worktree on the V2 engine (GitHub simulated, never live). */
class AgentV2ComputerPublishTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2ComputerFixture;

    private const BASE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    private ?string $head = null;
    private int $commits = 0;
    private array $claimed;
    private string $conn;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootComputer();
        $this->conn = $this->computerConnection();
        $github = $this->providerInstall('github', 'octo', 'gh-token');
        $this->grant($github, ['github_read_issue']);
        $this->admit('Fix issue #1 and open a draft PR.');
        $this->claimed = $this->claim();
        $this->fakeGithub();
    }

    private function snapshot(string $content): array
    {
        $files = [['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null, 'sha256' => hash('sha256', $content),
            'mode' => '100644', 'bytes' => strlen($content)]];
        $branch = 'vibyra-agent/'.$this->workspaceId;
        return ['baseSha' => self::BASE, 'branch' => $branch, 'files' => $files,
            'snapshotSha256' => Manifest::digest(self::BASE, $branch, $files)];
    }

    private function changes(string $content, string $callId): array
    {
        $action = $this->callTool($this->claimed, 'workspace_changes', $this->conn, [], $callId)->json('action');
        $this->macRun($this->claimed, $action, $this->snapshot($content))->assertOk()->assertJsonPath('action.state', 'completed');
        return $this->snapshot($content);
    }

    private function upload(string $content): array
    {
        $snapshot = $this->snapshot($content);
        $snapshot['files'][0]['contentBase64'] = base64_encode($content);
        return ['upload' => $snapshot];
    }

    private function publish(string $content, string $callId, ?string $expectedHead, bool $approve = true): array
    {
        $snapshot = $this->changes($content, $callId.'-changes');
        $action = $this->callTool($this->claimed, 'publish_branch', $this->conn, ['repository' => 'octo/app', 'baseBranch' => 'main',
            'message' => 'Fix issue #1', 'snapshotSha256' => $snapshot['snapshotSha256']], $callId)->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $args = DB::table('agent_tool_actions')->where('id', $action['id'])->value('arguments');
        $this->assertSame($expectedHead, json_decode($args, true)['expectedHeadSha']);
        $this->assertSame($snapshot['snapshotSha256'], json_decode($args, true)['snapshot']['snapshotSha256']);
        if ($approve) $this->decide($action)->assertOk()->assertJsonPath('action.state', 'approved');
        return $action;
    }

    public function test_the_fingerprint_binds_the_snapshot_and_a_changed_worktree_is_never_published(): void
    {
        $this->callTool($this->claimed, 'publish_branch', $this->conn, ['repository' => 'octo/app', 'baseBranch' => 'main',
            'message' => 'Fix', 'snapshotSha256' => str_repeat('f', 64)], 'p0')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $old = $this->publish("fixed\n", 'p1', null, false);
        $this->decide($old, 'decline')->assertOk();
        $action = $this->publish("fixed again\n", 'p2', null);
        $this->assertNotSame($this->fingerprintOf($old), $this->fingerprintOf($action));
        $this->macClaim($this->claimed, $action)->assertOk();
        // The worktree changed after approval: the Mac's upload no longer matches, nothing reaches GitHub.
        $this->macReceipt($this->claimed, $action['id'], $this->upload("fixed\n"))->assertOk()
            ->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.reason', 'snapshot_changed');
        $this->assertSame(0, $this->sent('POST', '#/git/#'));
    }

    public function test_publish_twice_to_the_same_agent_branch_then_open_a_draft_pr(): void
    {
        $first = $this->publish("fixed\n", 'p1', null);
        $this->macClaim($this->claimed, $first)->assertOk();
        $this->macReceipt($this->claimed, $first['id'], $this->upload("fixed\n"))->assertOk()
            ->assertJsonPath('action.state', 'completed')->assertJsonPath('action.receipt.providerResourceId', $this->head);
        $firstHead = $this->head;
        // A duplicate upload after completion writes nothing.
        $this->macReceipt($this->claimed, $first['id'], $this->upload("fixed\n"))->assertOk();
        $this->assertSame(1, $this->sent('POST', '#/git/refs$#'));

        $second = $this->publish("fixed twice\n", 'p2', $firstHead);
        $this->macClaim($this->claimed, $second)->assertOk();
        $this->macReceipt($this->claimed, $second['id'], $this->upload("fixed twice\n"))->assertOk()
            ->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.previousHeadSha', $firstHead);
        $this->assertNotSame($firstHead, $this->head);
        $this->assertSame(1, $this->sent('POST', '#/git/refs$#'));
        $this->assertSame(1, $this->sent('PATCH', '#/git/refs/heads/vibyra-agent/#'));

        $pr = $this->callTool($this->claimed, 'open_draft_pr', $this->conn, ['title' => 'Fix issue #1'], 'pr1')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame($this->head, json_decode(DB::table('agent_tool_actions')->where('id', $pr['id'])->value('arguments'), true)['expectedHeadSha']);
        $this->macList($this->claimed)->assertOk()->assertJsonCount(0, 'actions');
        $this->decide($pr)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.url', 'https://github.com/octo/app/pull/7');
        $this->assertSame(1, $this->sent('POST', '#/pulls$#'));
        $this->postJson($this->runnerPath('/runs/'.$this->claimed['id'].'/complete'), ['generation' => $this->claimed['generation'],
            'answer' => 'Draft PR #7 opened.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'completed');
    }

    private function fakeGithub(): void
    {
        $repo = 'api.github.com/repos/octo/app';
        $this->route('GET', '#'.$repo.'/git/ref/heads/main$#', Http::response(['ref' => 'refs/heads/main',
            'object' => ['type' => 'commit', 'sha' => self::BASE]]));
        $this->route('GET', '#'.$repo.'/git/ref/heads/vibyra-agent/#', fn () => $this->head === null
            ? Http::response(['message' => 'Not Found'], 404)
            : Http::response(['ref' => 'refs/heads/vibyra-agent/'.$this->workspaceId, 'object' => ['type' => 'commit', 'sha' => $this->head]]));
        $this->route('GET', '#'.$repo.'/git/commits/#', fn ($r) => Http::response(['sha' => basename($r->url()),
            'tree' => ['sha' => str_repeat('0', 39).(basename($r->url()) === self::BASE ? '0' : '1')]]));
        $this->route('POST', '#'.$repo.'/git/blobs$#', function ($r) {
            $content = base64_decode($r->data()['content']);
            return Http::response(['sha' => sha1('blob '.strlen($content)."\0".$content)], 201);
        });
        $this->route('POST', '#'.$repo.'/git/trees$#', fn () => Http::response(['sha' => str_repeat('e', 39).$this->commits], 201));
        $this->route('POST', '#'.$repo.'/git/commits$#', function ($r) {
            $this->commits++;
            return Http::response(['sha' => str_repeat('c', 39).$this->commits, 'tree' => ['sha' => $r->data()['tree']],
                'parents' => [['sha' => $r->data()['parents'][0]]], 'message' => $r->data()['message']], 201);
        });
        $ref = function ($r, int $status) {
            $this->head = $r->data()['sha'];
            return Http::response(['ref' => 'refs/heads/vibyra-agent/'.$this->workspaceId, 'object' => ['type' => 'commit', 'sha' => $this->head]], $status);
        };
        $this->route('POST', '#'.$repo.'/git/refs$#', fn ($r) => $ref($r, 201));
        $this->route('PATCH', '#'.$repo.'/git/refs/heads/vibyra-agent/#', fn ($r) => $ref($r, 200));
        $this->route('POST', '#'.$repo.'/pulls$#', fn ($r) => Http::response(['number' => 7, 'draft' => true,
            'title' => $r->data()['title'], 'body' => $r->data()['body'], 'html_url' => 'https://github.com/octo/app/pull/7',
            'head' => ['sha' => $this->head, 'ref' => $r->data()['head'], 'repo' => ['full_name' => 'octo/app']],
            'base' => ['sha' => self::BASE, 'ref' => 'main', 'repo' => ['full_name' => 'octo/app']]], 201));
    }
}
