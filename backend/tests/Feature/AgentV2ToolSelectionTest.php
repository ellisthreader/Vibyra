<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Connections\Connections;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Phase 8: the 10-tool manifest is chosen by task relevance, never by connection order alone. */
class AgentV2ToolSelectionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2ComputerFixture;

    private const GITHUB = ['github_list_repositories', 'github_list_issues', 'github_list_pull_requests', 'github_read_issue',
        'github_read_file', 'github_create_issue', 'github_comment_issue'];
    private const CALENDAR = ['google_calendar_list_calendars', 'google_calendar_list_events', 'google_calendar_freebusy',
        'google_calendar_create_event'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** GitHub (7), Calendar (4) and Gmail (3) granted in that order: 14 tools for 10 places. */
    private function threeServices(): array
    {
        $github = $this->providerInstall('github', 'octocat', 'gh-token');
        $calendar = $this->providerInstall('google_calendar', 'me@example.com', 'cal-token');
        $gmail = $this->gmailInstall('me@example.com');
        $this->grant($github, self::GITHUB);
        $this->grant($calendar, self::CALENDAR);
        $this->grant($gmail, ['gmail_read', 'gmail_search', 'gmail_send']);
        return [$github, $calendar, $gmail];
    }

    private function tools(string $prompt, ?string $key = null): array
    {
        $run = $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'],
            'idempotencyKey' => $key ?? 'send-'.Str::random(12), 'prompt' => $prompt])->assertCreated()->json('run');
        return $this->getJson('/api/agents/v2/runs/'.$run['id'].'/tools')->assertOk()->json('manifest.tools');
    }

    public function test_a_named_service_is_not_crowded_out_by_accounts_granted_earlier(): void
    {
        $this->threeServices();
        $tools = $this->tools('Send the weekly summary to the team from Gmail.');
        $this->assertCount(10, $tools);
        $this->assertSame(['gmail_search', 'gmail_read', 'gmail_send'], array_column(array_slice($tools, 0, 3), 'tool'),
            'The named account comes first, reads before its write.');
    }

    public function test_without_any_signal_every_account_gets_its_reads_before_any_write(): void
    {
        [$github, $calendar, $gmail] = $this->threeServices();
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['brief' => 'Helps me.']);
        $tools = $this->tools('What should I look at first today?');
        $this->assertCount(10, $tools);
        $this->assertSame([], array_values(array_filter($tools, fn ($t) => $t['kind'] === 'write')),
            'Ten reads exist, so no write displaces a read.');
        $this->assertEqualsCanonicalizing([$github, $calendar, $gmail], array_values(array_unique(array_column($tools, 'connectionId'))));
        $this->assertSame(['github_list_repositories', 'google_calendar_list_calendars', 'gmail_search'],
            array_column(array_slice($tools, 0, 3), 'tool'), 'Round-robin, connection order breaks ties.');
    }

    public function test_eight_mac_folder_tools_do_not_crowd_out_github(): void
    {
        $this->bootComputer();
        $computer = $this->computerConnection();
        $github = $this->providerInstall('github', 'octocat', 'gh-token');
        $this->grant($github, self::GITHUB);
        $tools = $this->tools('Open a GitHub issue about the flaky login test.');
        $byConnection = collect($tools)->groupBy('connectionId');
        $this->assertEqualsCanonicalizing(self::GITHUB, $byConnection[$github]->pluck('tool')->all());
        $this->assertSame('github_read_issue', $tools[0]['tool'], 'Inside an account, tools named by the prompt lead.');
        $this->assertSame(['workspace_list', 'workspace_read', 'workspace_search'], $byConnection[$computer]->pluck('tool')->all(),
            'Mac tools fill what is left, reads first.');
        // Old behaviour (connection order) would have been 8 Mac tools + 2 GitHub reads.
        $plain = $this->tools('Tidy up.');
        $this->assertGreaterThanOrEqual(4, collect($plain)->where('connectionId', $github)->count());
    }

    public function test_an_account_label_in_the_prompt_ranks_that_account_first(): void
    {
        $work = $this->gmailInstall('work@example.com', 'work-token');
        Http::fake(['www.googleapis.com/oauth2/v3/userinfo' => Http::response(['email' => 'personal@example.com'])]);
        $personal = app(Connections::class)->addAccount($this->user->id, 'gmail', 'personal-token')->id;
        $github = $this->providerInstall('github', 'octocat', 'gh-token');
        $calendar = $this->providerInstall('google_calendar', 'me@example.com', 'cal-token');
        foreach ([$github => self::GITHUB, $calendar => self::CALENDAR] as $id => $ops) $this->grant($id, $ops);
        $this->grant($work, ['gmail_search', 'gmail_read', 'gmail_send']);
        $this->grant($personal, ['gmail_search', 'gmail_read', 'gmail_send']);
        $tools = $this->tools('Search personal@example.com for the landlord email.');
        $this->assertSame(array_fill(0, 3, $personal), array_column(array_slice($tools, 0, 3), 'connectionId'));
        $this->assertContains($work, array_column($tools, 'connectionId'), 'The other Gmail account still gets its reads.');
    }

    public function test_the_teammate_job_and_conversation_history_break_ties(): void
    {
        [$github, $calendar] = $this->threeServices();
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['brief' => 'Keep my GitHub repositories healthy.']);
        $this->assertSame($github, $this->tools('Anything new?')[0]['connectionId']);
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['brief' => 'Helps me.']);
        $earlier = DB::table('agent_runs')->where('agent_id', $this->agent['id'])->orderBy('conversation_seq')->value('id');
        DB::table('agent_tool_actions')->insert(['id' => (string) Str::uuid(), 'run_id' => $earlier, 'user_id' => $this->user->id,
            'call_id' => 'c1', 'tool' => 'google_calendar_list_events', 'kind' => 'read', 'connection_id' => $calendar,
            'connection_generation' => 1, 'grant_id' => (string) Str::uuid(), 'grant_revision' => 1, 'arguments' => '{}',
            'args_hash' => str_repeat('a', 64), 'schema_revision' => 'x', 'state' => 'completed', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame($calendar, $this->tools('Anything new?')[0]['connectionId'], 'Accounts earlier turns used rank next.');
    }

    public function test_the_trigger_that_started_a_run_ranks_its_account_first(): void
    {
        [, , $gmail] = $this->threeServices();
        $trigger = (string) Str::uuid();
        DB::table('agent_triggers')->insert(['id' => $trigger, 'user_id' => $this->user->id, 'agent_id' => $this->agent['id'],
            'kind' => 'gmail.message', 'connection_id' => $gmail, 'filter' => '{}', 'prompt_template' => 'New mail.',
            'created_at' => now(), 'updated_at' => now()]);
        $event = (string) Str::uuid();
        DB::table('agent_trigger_events')->insert(['id' => $event, 'trigger_id' => $trigger, 'user_id' => $this->user->id,
            'event_key' => 'm1', 'state' => 'admitted', 'created_at' => now(), 'updated_at' => now()]);
        $tools = $this->tools('A new event arrived. Handle it.', 'trg:'.$event);
        $this->assertSame($gmail, $tools[0]['connectionId']);
    }

    public function test_the_manifest_is_stable_for_one_run(): void
    {
        $this->threeServices();
        $run = $this->admit('Check my calendar and email.');
        $first = $this->getJson('/api/agents/v2/runs/'.$run['id'].'/tools')->json('manifest');
        $this->assertSame($first, $this->getJson('/api/agents/v2/runs/'.$run['id'].'/tools')->json('manifest'));
        $this->assertLessThanOrEqual(10, count($first['tools']));
    }
}
