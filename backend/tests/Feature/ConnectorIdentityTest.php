<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** F-14 (security review 2026-09-30): "same account" is decided by a provider id, not by a display name two accounts can share. */
class ConnectorIdentityTest extends TestCase
{
    private function identity(string $slug, array $responses, string $token): string
    {
        Http::swap(new \Illuminate\Http\Client\Factory()); // each call is a different provider answer; fakes would otherwise stack
        Http::fake($responses);
        return app(Registry::class)->for($slug)->connect($token);
    }

    public function test_two_slack_workspaces_or_people_with_one_name_are_different_accounts(): void
    {
        $as = fn (string $team, string $user) => $this->identity('slack', ['slack.com/api/auth.test' => Http::response(
            ['ok' => true, 'team' => 'Acme', 'team_id' => $team, 'user_id' => $user])], 'xoxp-'.$team.$user);
        $first = $as('T01AAAA', 'U01AAAA');
        $this->assertStringStartsWith('Acme', $first);
        $this->assertSame($first, $as('T01AAAA', 'U01AAAA'));
        $this->assertNotSame($first, $as('T02BBBB', 'U01AAAA'), 'Another workspace with the same name.');
        $this->assertNotSame($first, $as('T01AAAA', 'U02BBBB'), 'Another person in the same workspace.');
    }

    public function test_two_notion_workspaces_with_one_name_are_different_accounts(): void
    {
        $as = fn (string $id) => $this->identity('notion', ['api.notion.com/v1/users/me' => Http::response(
            ['id' => $id, 'name' => 'Vibyra bot', 'bot' => ['workspace_name' => 'Team Space']])], 'secret-'.$id);
        $first = $as('11111111-aaaa-bbbb-cccc-000000000001');
        $this->assertStringStartsWith('Team Space', $first);
        $this->assertSame($first, $as('11111111-aaaa-bbbb-cccc-000000000001'));
        $this->assertNotSame($first, $as('22222222-aaaa-bbbb-cccc-000000000002'));
    }

    public function test_two_linear_people_with_one_name_are_different_accounts(): void
    {
        $as = fn (string $id) => $this->identity('linear', ['api.linear.app/graphql' => Http::response(
            ['data' => ['viewer' => ['id' => $id, 'name' => 'Sam Lee']]])], 'lin-'.$id);
        $first = $as('aaaaaaaa-1111-2222-3333-444444444444');
        $this->assertStringStartsWith('Sam Lee', $first);
        $this->assertSame($first, $as('aaaaaaaa-1111-2222-3333-444444444444'));
        $this->assertNotSame($first, $as('bbbbbbbb-1111-2222-3333-444444444444'));
    }

    public function test_a_provider_that_reports_no_id_keeps_its_plain_name(): void
    {
        $this->assertSame('Acme', $this->identity('slack', ['slack.com/api/auth.test' => Http::response(['ok' => true, 'team' => 'Acme'])], 'xoxp-x'));
    }
}
