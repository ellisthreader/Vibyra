<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\AgentV2\Run;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentDepthFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Part 16: the run timeline, search across runs and answers, transcript export and the plain statement about token cost (fixtures). */
class AgentDepthObservabilityTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentDepthFixture;

    private const KEY = 'AKIAJ3Q7ZB5N2XWV4LTR';
    private string $github;
    private string $gmail;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->startOfSecond());
        $this->bootV2();
        $this->depth(['observability', 'delegation']);
        $this->github = $this->providerInstall('github', '@owner', 'gh-token');
        $this->gmail = $this->gmailInstall('owner@example.com');
        $this->grant($this->gmail, ['gmail_search']);
        $this->grant($this->github, ['github_create_issue']);
        $this->fakeGmail(['gmail-token-a' => ['msg00001' => ['from' => 'a@b.co', 'subject' => 'Hi', 'body' => 'Hello']]]);
        $this->route('POST', '#api\.github\.com/repos/qa-org/sandbox/issues$#', Http::response(['number' => 12, 'title' => 'Sync', 'html_url' => 'https://github.com/qa-org/sandbox/issues/12'], 201));
    }

    /** A finished run: a read, an approved write 40 seconds later, a delegation that took a minute, and an answer. */
    private function story(): array
    {
        $calendar = $this->teammate('Calendar');
        $run = $this->admit('Check mail, open the issue and ask Calendar. My key is '.self::KEY.'.');
        $claimed = $this->claim();
        $this->travel(5)->seconds();
        $this->callTool($claimed, 'gmail_search', $this->gmail, ['query' => 'x'], 'c1')->assertOk();
        $write = $this->callTool($claimed, 'github_create_issue', $this->github, ['repository' => 'qa-org/sandbox', 'title' => 'Sync'], 'w1')->assertOk()->json('action');
        $this->travel(40)->seconds();
        $this->decide($write)->assertOk();
        $this->delegate($claimed, 'Calendar', 'Find a slot', 'd1')->assertOk();
        $this->travel(10)->seconds();
        $kid = $this->claim();
        $this->travel(50)->seconds();
        $this->complete($kid, 'Thursday at 10.')->assertOk();
        $this->complete($claimed, 'Done: issue 12 opened, Calendar says Thursday at 10. Key '.self::KEY)->assertOk();
        return [$run, $kid, $calendar];
    }

    public function test_the_timeline_lists_each_step_with_its_status_and_time_and_says_token_cost_is_unavailable(): void
    {
        [$run, $kid] = $this->story();
        $t = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/timeline')->assertOk()->json('timeline');
        $this->assertSame(['completed', true], [$t['state'], $t['terminal']]);
        $this->assertSame(105, $t['totalSeconds']);
        $this->assertFalse($t['tokenCost']['available']);
        $this->assertStringContainsString('your own AI account', $t['tokenCost']['note']);
        $kinds = array_column($t['steps'], 'kind');
        foreach (['start', 'tool', 'delegation', 'message', 'end'] as $kind) $this->assertContains($kind, $kinds);
        $steps = collect($t['steps']);
        $write = $steps->firstWhere('tool', 'github_create_issue');
        $this->assertSame(['ok', 40, 'allow'], [$write['status'], $write['seconds'], $write['approval'] ?? null]);
        $this->assertSame('Waiting for your approval', $steps->firstWhere('kind', 'wait')['title']);
        $this->assertSame(40, $steps->firstWhere('kind', 'wait')['seconds']);
        $delegated = $steps->firstWhere('kind', 'delegation');
        $this->assertSame([$kid['id'], 'ok', 60], [$delegated['delegated']['runId'], $delegated['status'], $delegated['seconds']]);
        $this->assertSame(60, $t['delegatedSeconds'], 'Delegated time rolls up into the parent.');
        $this->assertSame($steps->pluck('seq')->sort()->values()->all(), $steps->pluck('seq')->all(), 'Steps keep their order.');
        $this->assertStringNotContainsString(self::KEY, json_encode($t));
        // The delegated run has a timeline of its own.
        $this->getJson('/api/agents/v2/runs/'.$kid['id'].'/timeline')->assertOk()->assertJsonPath('timeline.state', 'completed');
    }

    public function test_a_waiting_run_shows_its_open_step_and_a_failed_tool_is_marked(): void
    {
        $run = $this->admit('Open it.');
        $claimed = $this->claim();
        $this->callTool($claimed, 'gmail_read', $this->gmail, ['id' => 'x'], 'refused')->assertOk()->assertJsonPath('action.state', 'refused');
        $this->callTool($claimed, 'github_create_issue', $this->github, ['repository' => 'qa-org/sandbox', 'title' => 'Sync'], 'w1')->assertOk();
        $this->travel(30)->seconds();
        $t = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/timeline')->json('timeline');
        $this->assertFalse($t['terminal']);
        $open = collect($t['steps'])->firstWhere('tool', 'github_create_issue');
        $this->assertSame(['waiting', 30], [$open['status'], $open['seconds']]);
        $this->assertSame('refused', collect($t['steps'])->firstWhere('tool', 'gmail_read')['status']);
    }

    public function test_an_export_is_markdown_or_json_and_masks_secrets_even_with_the_guard_off(): void
    {
        [$run] = $this->story();
        $md = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/export?format=markdown')->assertOk()->json('export');
        $this->assertSame(['markdown', 'text/markdown'], [$md['format'], $md['contentType']]);
        $this->assertStringEndsWith('.md', $md['filename']);
        $this->assertStringContainsString('## Timeline', $md['content']);
        $this->assertStringContainsString('delegated', $md['content']);
        $this->assertStringContainsString('Token cost is not shown', $md['content']);
        $this->assertStringNotContainsString(self::KEY, $md['content']);
        $this->assertStringContainsString('[redacted:aws_access_key]', $md['content']);
        $json = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/export?format=json')->assertOk()->json('export');
        $data = json_decode($json['content'], true);
        $this->assertSame('completed', $data['run']['state']);
        $this->assertStringNotContainsString(self::KEY, $json['content']);
        $this->assertSame(['github_create_issue'], array_values(array_map(fn ($a) => $a['tool'], array_filter($data['actions'], fn ($a) => $a['kind'] === 'write'))));
        $this->assertFalse($data['tokenCost']['available']);
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/export?format=pdf')->assertStatus(422);
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/export')->assertStatus(422);
    }

    public function test_search_finds_prompts_and_answers_by_substring_with_masked_snippets(): void
    {
        [$run] = $this->story();
        $hit = $this->getJson('/api/agents/v2/runs/search?q=thursday')->assertOk()->json('items');
        $this->assertContains($run['id'], array_column($hit, 'runId'));
        $mine = collect($hit)->firstWhere('runId', $run['id']);
        $this->assertSame('answer', $mine['field']);
        $this->assertStringContainsString('Thursday', $mine['snippet']);
        $this->assertStringNotContainsString(self::KEY, json_encode($hit));
        $this->assertTrue(collect($hit)->contains(fn ($h) => $h['delegated'] === true && $h['agentName'] === 'Calendar'));
        $byAgent = $this->getJson('/api/agents/v2/runs/search?q=thursday&agentId='.$this->agent['id'])->json('items');
        $this->assertSame([$run['id']], array_column($byAgent, 'runId'));
        $this->getJson('/api/agents/v2/runs/search?q=zzzznothing')->assertOk()->assertJsonPath('items', []);
    }

    public function test_search_is_bounded_escaped_paged_and_private(): void
    {
        foreach (range(1, 4) as $i) { $this->admit('Report number '.$i.' covers 100% of cases'); $c = $this->claim(); $this->complete($c, 'ok')->assertOk(); }
        $this->admit('plain words only'); $c = $this->claim(); $this->complete($c, 'ok')->assertOk();
        $this->assertCount(4, $this->getJson('/api/agents/v2/runs/search?q='.urlencode('100%'))->json('items'), 'A percent sign is text, not a wildcard.');
        $this->assertCount(0, $this->getJson('/api/agents/v2/runs/search?q='.urlencode('r_port'))->json('items'), 'An underscore is text too.');
        $page = $this->getJson('/api/agents/v2/runs/search?q=report&limit=3')->assertOk()->json();
        $this->assertCount(3, $page['items']);
        $this->assertNotNull($page['next']);
        $rest = $this->getJson('/api/agents/v2/runs/search?q=report&limit=3&cursor='.$page['next'])->json();
        $this->assertCount(1, $rest['items']);
        $this->assertNull($rest['next']);
        $this->assertSame(4, count(array_unique(array_merge(array_column($page['items'], 'runId'), array_column($rest['items'], 'runId')))));
        config(['agent_depth.search_window' => 2]);
        $this->assertCount(1, $this->getJson('/api/agents/v2/runs/search?q=report')->json('items'), 'Only the newest runs are searched.');
        $this->getJson('/api/agents/v2/runs/search?q=a')->assertStatus(422)->assertJsonPath('code', 'invalid_query');
        $this->getJson('/api/agents/v2/runs/search?q='.str_repeat('a', 81))->assertStatus(422);
        $this->getJson('/api/agents/v2/runs/search')->assertStatus(422);
        $other = User::factory()->create();
        Run::query()->where('prompt', 'like', 'plain%')->update(['user_id' => $other->id]);
        $this->assertCount(0, $this->getJson('/api/agents/v2/runs/search?q=plain')->json('items'));
    }

    public function test_another_accounts_run_and_a_switched_off_feature_answer_not_found(): void
    {
        $run = $this->admit('Mine.');
        $other = User::factory()->create();
        $foreign = Run::query()->whereKey($run['id'])->first();
        Run::query()->whereKey($foreign->id)->update(['user_id' => $other->id]);
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/timeline')->assertStatus(404)->assertJsonPath('code', 'run_not_found');
        $this->getJson('/api/agents/v2/runs/'.$run['id'].'/export?format=json')->assertStatus(404);
        Run::query()->whereKey($foreign->id)->update(['user_id' => $this->user->id]);
        config(['agent_depth.observability' => false]);
        foreach (['/timeline', '/export?format=json'] as $path) $this->getJson('/api/agents/v2/runs/'.$run['id'].$path)->assertStatus(404)->assertJsonPath('code', 'not_available');
        $this->getJson('/api/agents/v2/runs/search?q=mine')->assertStatus(404);
        $this->assertSame(0, DB::table('agent_run_events')->where('type', 'timeline.opened')->count());
    }

    public function test_the_capabilities_say_which_parts_are_on(): void
    {
        $this->getJson('/api/agents/v2/capabilities')->assertOk()->assertJsonPath('depth.observability', true)->assertJsonPath('depth.delegation', true)
            ->assertJsonPath('depth.rules', false)->assertJsonPath('depth.secretGuard', false);
    }
}
