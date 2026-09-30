<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\GithubWrites;
use App\Services\ChatConnectors\Github\ReadTools;
use App\Services\ChatConnectors\Registry;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/** F-16 and F-17 (security review 2026-09-30): tool arguments that a downstream parser could read differently are refused. */
class AgentV2ToolArgumentHardeningTest extends TestCase
{
    private function refused(callable $validate, string $why): void
    {
        try { $validate(); } catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode(), $why); return; }
        $this->fail('Accepted: '.$why);
    }

    public function test_a_recipient_a_mail_parser_could_read_as_two_people_is_refused_everywhere(): void
    {
        $bad = ['"a@evil.com,b"@c.com', '"quoted"@c.com', 'a@b.com,c@d.com', 'a@b.com;c@d.com', 'Name <a@b.com>', "a@b.com\nBcc: x@y.com",
            'a b@c.com', 'a@b.com ', "a@b.com\t", 'a(comment)@b.com', 'a\\@b.com@c.com', "\"a\"@b.com"];
        foreach (['gmail' => ['gmail_send', 'to'], 'outlook_mail' => ['outlook_mail_send', 'to']] as $slug => [$tool]) {
            $connector = app(Registry::class)->for($slug);
            foreach ($bad as $to) $this->refused(fn () => $connector->validate($tool, ['to' => $to, 'subject' => 'Hi', 'body' => 'Body']), $slug.' '.$to);
            $ok = $connector->validate($tool, ['to' => 'first.last+tag@sub.example.co.uk', 'subject' => 'Hi', 'body' => 'Body']);
            $this->assertSame('first.last+tag@sub.example.co.uk', $ok['to']);
        }
        $calendar = app(\App\Services\AgentRuns\Tools\Providers\OutlookCalendarTools::class);
        $window = ['timeMin' => '2026-10-01T09:00:00Z', 'timeMax' => '2026-10-01T17:00:00Z', 'timeZone' => 'UTC'];
        $this->refused(fn () => $calendar->validate('outlook_calendar_freebusy', ['schedules' => ['"a@evil.com,b"@c.com']] + $window), 'freebusy schedule');
        $this->assertSame(['a@b.com'], $calendar->validate('outlook_calendar_freebusy', ['schedules' => ['A@B.com']] + $window)['schedules']);
    }

    public function test_the_github_read_validator_refuses_dot_segments_like_the_write_validator(): void
    {
        foreach (['../user', './user', 'owner/..', 'owner/.', '..', '../..', '.../x/y', 'a/b/c', 'owner/repo with space', '../user/'] as $repository)
            $this->refused(fn () => ReadTools::validate('github_issue', ['repository' => $repository, 'number' => 1]), $repository);
        $this->assertSame('octo/app.js', ReadTools::validate('github_issue', ['repository' => 'octo/app.js', 'number' => 1])['repository']);
        $this->assertSame('octo/.github', ReadTools::validate('github_issue', ['repository' => 'octo/.github', 'number' => 1])['repository']);
        $this->refused(fn () => GithubWrites::repository('../user'), 'write validator still refuses it');
    }
}
