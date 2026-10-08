<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Mcp\{ToolList, ToolNames};
use Tests\TestCase;

/** The Mac refuses any tool name outside ^[a-z0-9_]{1,40}$ and one bad name fails the whole run, so MCP tool names must fit. */
class AgentV2ToolNamesTest extends TestCase
{
    public function test_the_old_remote_name_form_could_exceed_what_the_mac_accepts(): void
    {
        $old = 'mcp_1a2b3c4d__'.substr(trim(preg_replace('/[^a-z0-9_]+/', '_', strtolower(str_repeat('a', 60))), '_'), 0, 48);
        $this->assertSame(62, strlen($old), 'The previous form allowed 62 characters; the Mac accepts 40.');
    }

    public function test_every_name_fits_is_stable_and_long_names_stay_distinct(): void
    {
        foreach (['mcp_1a2b3c4d', 'lmcp_1a2b3c4d'] as $slug) {
            $names = [];
            foreach (['read_file', 'Search Docs!', str_repeat('very_long_tool_name_', 5).'one', str_repeat('very_long_tool_name_', 5).'two', 'x'] as $remote) {
                $name = ToolNames::make($slug, $remote);
                $this->assertMatchesRegularExpression('/^[a-z0-9_]{1,40}$/D', $name);
                $this->assertSame($name, ToolNames::make($slug, $remote), 'Grants keep pointing at the same name.');
                $names[] = $name;
            }
            $this->assertCount(5, array_unique($names));
            $this->assertSame($slug.'__read_file', $names[0], 'A short name is unchanged.');
        }
        $this->assertNull(ToolNames::make('mcp_1a2b3c4d', '!!!'));
    }

    public function test_a_catalogue_with_long_names_normalises_to_names_the_mac_accepts(): void
    {
        $raw = [['name' => str_repeat('long_tool_', 12), 'inputSchema' => ['type' => 'object']], ['name' => 'ok', 'inputSchema' => ['type' => 'object']]];
        foreach (ToolList::normalise($raw, 'lmcp_deadbeef')['tools'] as $tool) $this->assertLessThanOrEqual(40, strlen($tool['tool']));
    }
}
