<?php

namespace Tests\Feature;

use App\Models\AgentV2\ToolAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Schema};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** Upgrade the captured ee5c action schema without resetting existing actions or adding unshipped depth tables. */
final class AgentStageTwoSecretUpgradeTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    public function test_existing_live_actions_survive_the_independent_nullable_column_upgrade(): void
    {
        $this->bootV2();
        $c = $this->gmailInstall('owner@example.com');
        $this->grant($c, ['gmail_send']);
        $this->admit();
        $r = $this->claim();
        $a = $this->callTool($r, 'gmail_send', $c,
            ['to' => 'to@example.com', 'subject' => 'Existing', 'body' => 'Approved later'], 'prior-live')->assertOk()->json('action');
        $migration = $this->migration();
        $migration->down();
        $this->assertFalse(Schema::hasColumn('agent_tool_actions', 'secret_kinds'));
        $before = (array) DB::table('agent_tool_actions')->where('id', $a['id'])->first();
        $migration->up();
        $after = (array) DB::table('agent_tool_actions')->where('id', $a['id'])->first();
        $this->assertNull($after['secret_kinds']);
        unset($after['secret_kinds']);
        $this->assertSame($before, $after);
        $this->assertNull(ToolAction::findOrFail($a['id'])->secret_kinds);
        $this->assertFalse(Schema::hasTable('agent_approval_rules'));
        $this->assertFalse(Schema::hasTable('agent_delegations'));
    }

    public function test_fresh_schema_and_repeated_upgrade_keep_nullable_array_cast(): void
    {
        $this->assertTrue(Schema::hasColumn('agent_tool_actions', 'secret_kinds'));
        $this->migration()->up();
        $action = new ToolAction;
        $action->secret_kinds = ['github_token'];
        $this->assertSame(['github_token'], $action->secret_kinds);
        $this->assertSame('["github_token"]', $action->getAttributes()['secret_kinds']);
    }

    public function test_rollback_keeps_the_column_owned_by_a_preexisting_rules_migration(): void
    {
        DB::table('migrations')->insert(['migration' => '2026_10_02_160100_create_agent_approval_rules', 'batch' => 1]);
        $this->migration()->down();
        $this->assertTrue(Schema::hasColumn('agent_tool_actions', 'secret_kinds'));
    }

    private function migration(): \Illuminate\Database\Migrations\Migration
    {
        return require database_path('migrations/2026_10_08_200000_add_secret_kinds_to_agent_tool_actions.php');
    }
}
