<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Each advertised tool needs a validated, recorded provider call. */
class ConnectorOperationsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true]);
    }

    /**
     * One case per operation: the arguments the model would send, the url pattern
     * the provider answers on, the bodies it answers with in order, and the substring
     * the summary has to end up with.
     *
     * The bodies are plain arrays rather than `Http::response` objects because a data
     * provider runs before the application boots, and a facade called out here would
     * have no container to resolve against.
     *
     * @return array<string, array{0: string, 1: string, 2: array, 3: string, 4: array, 5: string}>
     */
    public static function operations(): array
    {
        $cases = [
            // --- GitHub -------------------------------------------------------
            ['github', 'github_list_repositories', [], 'api.github.com/user/repos*', [[
                ['full_name' => 'ellis/app', 'description' => 'The app', 'language' => 'Swift',
                    'private' => true, 'open_issues_count' => 3, 'updated_at' => '2026-09-01T00:00:00Z'],
            ]], 'Listed 1 repositories'],
            ['github', 'github_search_issues', ['query' => 'crash'], 'api.github.com/search/issues*', [[
                'items' => [['number' => 4, 'title' => 'Crash on launch', 'state' => 'open',
                    'repository_url' => 'https://api.github.com/repos/ellis/app']],
            ]], 'Searched GitHub for "crash"'],
            ['github', 'github_issue', ['repository' => 'ellis/app', 'number' => 4], 'api.github.com/repos/*', [
                ['number' => 4, 'title' => 'Crash on launch', 'body' => 'Open this screen.', 'comments' => 1],
                [['body' => 'Repro on iPhone', 'user' => ['login' => 'ellis']]],
            ], 'Read issue #4'],
            ['github', 'github_recent_commits', ['repository' => 'ellis/app'], 'api.github.com/repos/*', [[
                ['sha' => 'abcdef1234', 'commit' => ['message' => "Fix the crash\n\nDetails", 'author' => ['name' => 'Ellis', 'date' => '2026-09-01T00:00:00Z']]],
            ]], 'Read the latest commits on ellis/app'],
            ['github', 'github_create_issue', ['repository' => 'ellis/app', 'title' => 'It crashes', 'body' => 'On launch.'],
                'api.github.com/repos/*', [['number' => 12, 'title' => 'It crashes', 'html_url' => 'https://github.com/ellis/app/issues/12']],
                'Opened issue #12 on ellis/app'],

            ['github', 'github_pull_request', ['repository' => 'ellis/app', 'number' => 4], 'api.github.com/repos/*',
                [['number' => 4, 'title' => 'Fix', 'head' => ['sha' => 'abc']], [], ['check_runs' => []], ['statuses' => []]], 'Read pull request'],
            ['github', 'github_pull_request_files', ['repository' => 'ellis/app', 'number' => 4], 'api.github.com/repos/*',
                [[['filename' => 'src/app.ts', 'patch' => '+fixed']]], 'Read changed files'],
            ['github', 'github_repository_activity', ['repository' => 'ellis/app'], 'api.github.com/*',
                [[], ['items' => [], 'total_count' => 0]], 'Read repository activity'],
            ['github', 'github_read_file', ['repository' => 'ellis/app', 'path' => 'test.ts', 'ref' => 'abc'], 'api.github.com/repos/*',
                [['type' => 'file', 'encoding' => 'base64', 'content' => 'dGVzdA==']], 'Read file'],

            // --- Stripe -------------------------------------------------------
            ['stripe', 'stripe_account', [], 'api.stripe.com/*', [['id' => 'acct_test']], 'Stripe account details'],
            ['stripe', 'stripe_projects', [], 'api.stripe.com/*', [['data' => [], 'has_more' => false]], 'Stripe project tags'],
            ['stripe', 'stripe_revenue', ['scope' => 'account'], 'api.stripe.com/*', [['data' => [], 'has_more' => false]], 'Stripe payment report'],
            ['stripe', 'stripe_balance', [], 'api.stripe.com/*', [[
                'available' => [['amount' => 12345, 'currency' => 'gbp']], 'pending' => [],
            ]], 'Read your Stripe balance'],
            ['stripe', 'stripe_recent_payments', [], 'api.stripe.com/*', [[
                'data' => [['id' => 'ch_1', 'amount' => 500, 'currency' => 'gbp', 'status' => 'succeeded', 'created' => 1757462400]],
            ]], 'most recent Stripe payments'],
            ['stripe', 'stripe_find_customer', ['email' => 'a@b.test'], 'api.stripe.com/*', [[
                'data' => [['id' => 'cus_1', 'email' => 'a@b.test', 'created' => 1757462400]],
            ]], 'Looked up the Stripe customer a@b.test'],
            ['stripe', 'stripe_create_customer', ['email' => 'new@b.test'], 'api.stripe.com/*', [
                ['data' => []],
                ['id' => 'cus_2', 'email' => 'new@b.test'],
            ], 'Created the Stripe customer new@b.test'],

            // --- Figma ----------------------------------------------------------
            ['figma', 'figma_list_frames', ['file' => 'ABCDEFGHIJKLMNOP'], 'api.figma.com/v1/files/*', [[
                'name' => 'Design File', 'lastModified' => '2026-09-01T00:00:00Z', 'version' => '123',
                'document' => ['id' => '0:0', 'name' => 'Document', 'type' => 'DOCUMENT', 'children' => [
                    ['id' => '1:0', 'name' => 'Page 1', 'type' => 'CANVAS', 'children' => [
                        ['id' => '1:1', 'name' => 'Home', 'type' => 'FRAME', 'absoluteBoundingBox' => ['x' => 0, 'y' => 0, 'width' => 390, 'height' => 844]],
                    ]],
                ]],
            ]], 'pages and frames in Figma file ABCDEFGHIJKLMNOP'],
            ['figma', 'figma_read_frame', ['file' => 'https://www.figma.com/file/ABCDEFGHIJKLMNOP/Test?node-id=1-1'], 'api.figma.com/v1/files/*', [[
                'nodes' => ['1:1' => ['document' => ['id' => '1:1', 'name' => 'Home', 'type' => 'FRAME',
                    'absoluteBoundingBox' => ['x' => 0, 'y' => 0, 'width' => 390, 'height' => 844], 'children' => [
                        ['id' => '1:2', 'name' => 'Title', 'type' => 'TEXT', 'characters' => 'Welcome',
                            'fills' => [['type' => 'SOLID', 'color' => ['r' => 0, 'g' => 0, 'b' => 0], 'opacity' => 1]]],
                    ]]]],
            ]], 'a frame in Figma file ABCDEFGHIJKLMNOP'],
            ['figma', 'figma_file_comments', ['file' => 'ABCDEFGHIJKLMNOP'], 'api.figma.com/v1/files/*', [[
                'comments' => [['id' => 'c1', 'message' => 'Looks good', 'user' => ['handle' => 'ellis'],
                    'created_at' => '2026-09-01T00:00:00Z', 'client_meta' => ['node_id' => ['1:1']]]],
            ]], 'comments on Figma file ABCDEFGHIJKLMNOP'],

            // --- Google Workspace -------------------------------------------
            ['gmail', 'gmail_search', ['query' => 'is:unread'], 'gmail.googleapis.com/gmail/v1/users/me/messages*', [
                ['messages' => [['id' => 'abc12345678', 'threadId' => 'thread1']]],
                ['payload' => ['headers' => [['name' => 'Subject', 'value' => 'Hello'], ['name' => 'From', 'value' => 'a@example.com']]],
                    'snippet' => 'Hi']], 'Found 1 Gmail messages'],
            ['gmail', 'gmail_read', ['id' => 'abc12345678'], 'gmail.googleapis.com/gmail/v1/users/me/messages/*', [[
                'payload' => ['headers' => [['name' => 'Subject', 'value' => 'Hello']], 'mimeType' => 'text/plain',
                    'body' => ['data' => 'SGVsbG8=']],
            ]], 'Read Gmail message abc12345678'],
            ['gmail', 'gmail_send', ['to' => 'a@example.com', 'subject' => 'Hello', 'body' => 'Hi'],
                'gmail.googleapis.com/gmail/v1/users/me/messages/send', [['id' => 'sent12345']], 'Sent email to a@example.com'],
            ['google_calendar', 'google_calendar_upcoming', ['days' => 7],
                'www.googleapis.com/calendar/v3/calendars/primary/events*', [[
                    'items' => [['id' => 'event1', 'summary' => 'Call', 'start' => ['dateTime' => '2026-10-01T09:00:00Z'],
                        'end' => ['dateTime' => '2026-10-01T10:00:00Z']]]]], 'Read 1 upcoming Google Calendar events'],
            ['google_calendar', 'google_calendar_create_event', ['title' => 'Call',
                'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-01T10:00:00Z'],
                'www.googleapis.com/calendar/v3/calendars/primary/events', [['id' => 'event1', 'summary' => 'Call']],
                'Created Google Calendar event Call'],
            ['google_drive', 'google_drive_search', ['query' => 'budget'], 'www.googleapis.com/drive/v3/files*', [[
                'files' => [['id' => 'abcdefghijkl', 'name' => 'Budget', 'mimeType' => 'application/vnd.google-apps.spreadsheet']]]],
                'Found 1 Google Drive files'],
            ['google_drive', 'google_drive_read', ['id' => 'abcdefghijkl'], 'www.googleapis.com/drive/v3/files/*', [
                ['id' => 'abcdefghijkl', 'name' => 'Notes', 'mimeType' => 'application/vnd.google-apps.document'],
                ['text' => 'Meeting notes']], 'Read Google Drive file Notes'],

            // --- Microsoft Graph ----------------------------------------------
            ['outlook_mail', 'outlook_mail_search', ['query' => 'invoice'], 'graph.microsoft.com/v1.0/me/messages*', [
                ['value' => [['id' => 'message123', 'subject' => 'Invoice',
                    'from' => ['emailAddress' => ['address' => 'a@example.com']]]]]], 'Found 1 Outlook messages'],
            ['outlook_mail', 'outlook_mail_read', ['id' => 'message123'], 'graph.microsoft.com/v1.0/me/messages/*', [[
                'id' => 'message123', 'subject' => 'Invoice', 'body' => ['contentType' => 'text', 'content' => 'Please pay']]],
                'Read Outlook message message123'],
            ['outlook_mail', 'outlook_mail_send', ['to' => 'a@example.com', 'subject' => 'Hello', 'body' => 'Hi'],
                'graph.microsoft.com/v1.0/me/sendMail', [[]], 'Microsoft accepted email to a@example.com'],
            ['outlook_calendar', 'outlook_calendar_upcoming', ['days' => 7],
                'graph.microsoft.com/v1.0/me/calendar/calendarView*', [
                    ['value' => [['id' => 'event123', 'subject' => 'Call',
                        'start' => ['dateTime' => '2026-10-01T09:00:00']]]]], 'Read 1 upcoming Outlook events'],
            ['outlook_calendar', 'outlook_calendar_create_event', ['title' => 'Call',
                'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-01T10:00:00Z'],
                'graph.microsoft.com/v1.0/me/events', [['id' => 'event123']], 'Created Outlook event Call'],
            ['onedrive', 'onedrive_search', ['query' => 'notes'], 'graph.microsoft.com/v1.0/me/drive/root/search*', [
                ['value' => [['id' => 'item123', 'name' => 'Notes.txt', 'file' => ['mimeType' => 'text/plain']]]]],
                'Found 1 OneDrive items'],
            ['onedrive', 'onedrive_read', ['id' => 'item123'], '*', [
                ['id' => 'item123', 'name' => 'Notes.txt', 'size' => 5, 'file' => ['mimeType' => 'text/plain'],
                    '@microsoft.graph.downloadUrl' => 'https://files.example.sharepoint.com/notes'],
                'hello'], 'Read OneDrive file Notes.txt'],
            ['teams', 'teams_chats', [], 'graph.microsoft.com/v1.0/me/chats*', [[
                'value' => [['id' => '19:abc@thread.v2', 'topic' => 'Team']]]], 'Listed 1 Teams chats'],
            ['teams', 'teams_chat_messages', ['chatId' => '19:abc@thread.v2'],
                'graph.microsoft.com/v1.0/me/chats/*', [[
                    'value' => [['id' => 'message1', 'body' => ['contentType' => 'text', 'content' => 'Hello']]]]],
                'Read 1 Teams chat messages'],
            ['sharepoint', 'sharepoint_sites', ['query' => 'product'], 'graph.microsoft.com/v1.0/sites*', [[
                'value' => [['id' => 'example.sharepoint.com,site,web', 'displayName' => 'Product']]]],
                'Found 1 SharePoint sites'],
            ['sharepoint', 'sharepoint_files', ['siteId' => 'example.sharepoint.com,site,web', 'query' => 'plan'],
                'graph.microsoft.com/v1.0/sites/*', [[
                    'value' => [['id' => 'item123', 'name' => 'Plan.txt']]]], 'Found 1 SharePoint files'],
            ['sharepoint', 'sharepoint_read', ['siteId' => 'example.sharepoint.com,site,web', 'itemId' => 'item123'],
                '*', [
                    ['id' => 'item123', 'name' => 'Plan.txt', 'size' => 4,
                        'file' => ['mimeType' => 'text/plain'],
                        '@microsoft.graph.downloadUrl' => 'https://files.example.sharepoint.com/plan'],
                    'plan'], 'Read SharePoint file Plan.txt'],

            // --- Slack --------------------------------------------------------
            ['slack', 'slack_channels', [], 'slack.com/api/conversations.list*', [[
                'ok' => true, 'channels' => [['id' => 'C12345678', 'name' => 'general', 'is_member' => true]]]],
                'Listed 1 Slack channels'],
            ['slack', 'slack_history', ['channel' => 'C12345678'], 'slack.com/api/conversations.history*', [[
                'ok' => true, 'messages' => [['user' => 'U12345678', 'text' => 'Hello', 'ts' => '1.0']]]],
                'Read 1 Slack messages'],
            ['slack', 'slack_post_message', ['channel' => 'C12345678', 'text' => 'Hello'],
                'slack.com/api/chat.postMessage', [['ok' => true, 'channel' => 'C12345678', 'ts' => '1.0']],
                'Posted Slack message in C12345678'],

            // --- Notion -------------------------------------------------------
            ['notion', 'notion_search', ['query' => 'plan'], 'api.notion.com/v1/search', [[
                'results' => [['object' => 'page', 'id' => '12345678-1234-1234-1234-123456789abc',
                    'properties' => ['Name' => ['type' => 'title', 'title' => [['plain_text' => 'Plan']]]]]]]],
                'Found 1 Notion pages'],
            ['notion', 'notion_read_page', ['id' => '12345678-1234-1234-1234-123456789abc'],
                'api.notion.com/v1/*', [
                    ['id' => '12345678-1234-1234-1234-123456789abc', 'url' => 'https://notion.so/page'],
                    ['results' => [['type' => 'paragraph', 'paragraph' => [
                        'rich_text' => [['plain_text' => 'Hello']]]]]]], 'Read 1 Notion page blocks'],

            // --- Linear -------------------------------------------------------
            ['linear', 'linear_teams', [], 'api.linear.app/graphql', [[
                'data' => ['teams' => ['nodes' => [['id' => 'team1', 'name' => 'Product', 'key' => 'PRO']]]]]],
                'Listed 1 Linear teams'],
            ['linear', 'linear_search_issues', ['query' => 'crash'], 'api.linear.app/graphql', [[
                'data' => ['issues' => ['nodes' => [['id' => 'issue1', 'identifier' => 'PRO-1',
                    'title' => 'Crash']]]]]], 'Found 1 Linear issues'],
            ['linear', 'linear_issue', ['id' => 'PRO-1'], 'api.linear.app/graphql', [[
                'data' => ['issue' => ['id' => 'issue1', 'identifier' => 'PRO-1', 'title' => 'Crash']]]],
                'Read Linear issue PRO-1'],
            ['linear', 'linear_create_issue', ['teamId' => '12345678-1234-1234-1234-123456789abc',
                'title' => 'Crash', 'description' => 'On launch'], 'api.linear.app/graphql', [[
                    'data' => ['issueCreate' => ['success' => true, 'issue' => ['id' => 'issue1',
                        'identifier' => 'PRO-1', 'title' => 'Crash']]]]], 'Created Linear issue PRO-1'],
        ];
        return array_combine(array_map(fn ($case) => $case[1], $cases), $cases);
    }

    #[DataProvider('operations')]
    public function test_an_operation_validates_its_arguments_and_reshapes_the_answer(
        string $slug, string $operation, array $arguments, string $pattern, array $bodies, string $summary): void
    {
        // Several operations make more than one call - resolving a name to an id
        // before writing against it - so the answers are a queue, and the last one
        // repeats for anything further the connector asks.
        $sequence = Http::sequence();
        foreach ($bodies as $body) $sequence->push($body,
            $operation === 'outlook_mail_send' ? 202 : 200);
        Http::fake([$pattern => $sequence->whenEmpty(Http::response($bodies[count($bodies) - 1]))]);
        $connector = app(Registry::class)->for($slug);
        $safe = $connector->validate($operation, $arguments);
        $outcome = $connector->run($operation, $safe, 'test-credential');

        $this->assertIsArray($outcome['result'], $operation.' must return a result array');
        $this->assertArrayNotHasKey('error', $outcome['result'],
            $operation.' failed against its recorded answer: '.json_encode($outcome['result']));
        $this->assertStringContainsString($summary, (string) $outcome['summary']);
    }

    /**
     * What each write actually puts on the wire. The test above proves a write does
     * not fall over; this proves it would be understood — the right verb, the right
     * path, and the payload under the key the provider's own API reference names.
     * A write that 200s in a fake and 400s against the real service is the failure
     * this exists to catch, and it is the one no amount of recorded reading finds.
     */
    public function test_a_write_sends_the_request_its_provider_documents(): void
    {
        $expected = [
            'github' => ['github_create_issue', ['repository' => 'ellis/app', 'title' => 'It crashes'],
                'api.github.com/repos/*', [['number' => 1]],
                'POST', 'https://api.github.com/repos/ellis/app/issues', ['title' => 'It crashes']],
            'stripe' => ['stripe_create_customer', ['email' => 'new@b.test'],
                'api.stripe.com/*', [['data' => []], ['id' => 'cus_2']],
                'POST', 'https://api.stripe.com/v1/customers', null],
            'gmail' => ['gmail_send', ['to' => 'a@example.com', 'subject' => 'Hello', 'body' => 'Hi'],
                'gmail.googleapis.com/gmail/v1/users/me/messages/send', [['id' => 'sent12345']],
                'POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', ['raw' => null]],
            'google_calendar' => ['google_calendar_create_event', ['title' => 'Call',
                'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-01T10:00:00Z'],
                'www.googleapis.com/calendar/v3/calendars/primary/events', [['id' => 'event1']],
                'POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', ['summary' => 'Call']],
            'outlook_mail' => ['outlook_mail_send', ['to' => 'a@example.com', 'subject' => 'Hello', 'body' => 'Hi'],
                'graph.microsoft.com/v1.0/me/sendMail', [[]],
                'POST', 'https://graph.microsoft.com/v1.0/me/sendMail', ['message' => null]],
            'outlook_calendar' => ['outlook_calendar_create_event', ['title' => 'Call',
                'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-01T10:00:00Z'],
                'graph.microsoft.com/v1.0/me/events', [['id' => 'event123']],
                'POST', 'https://graph.microsoft.com/v1.0/me/events', ['subject' => 'Call']],
            'slack' => ['slack_post_message', ['channel' => 'C12345678', 'text' => 'Hello'],
                'slack.com/api/chat.postMessage', [['ok' => true, 'channel' => 'C12345678', 'ts' => '1.0']],
                'POST', 'https://slack.com/api/chat.postMessage', ['channel' => 'C12345678', 'text' => 'Hello']],
            'linear' => ['linear_create_issue', ['teamId' => '12345678-1234-1234-1234-123456789abc',
                'title' => 'Crash', 'description' => 'On launch'], 'api.linear.app/graphql', [[
                    'data' => ['issueCreate' => ['success' => true, 'issue' => ['id' => 'issue1']]]]],
                'POST', 'https://api.linear.app/graphql', ['variables' => null]],
        ];

        foreach ($expected as $slug => [$operation, $arguments, $pattern, $bodies, $method, $url, $payload]) {
            $sequence = Http::sequence();
            foreach ($bodies as $body) $sequence->push($body,
                $operation === 'outlook_mail_send' ? 202 : 200);
            Http::fake([$pattern => $sequence->whenEmpty(Http::response($bodies[count($bodies) - 1]))]);

            $connector = app(Registry::class)->for($slug);
            $connector->run($operation, $connector->validate($operation, $arguments), 'test-credential');

            Http::assertSent(function ($request) use ($method, $url, $payload) {
                if ($request->method() !== $method || $request->url() !== $url) return false;
                foreach ((array) $payload as $key => $value) {
                    if ($value === null ? !isset($request->data()[$key]) : ($request->data()[$key] ?? null) !== $value) return false;
                }
                return true;
            });
        }
    }

    /**
     * The guard. A schema with no case above would otherwise be a tool that reaches
     * a person's account having never once been run in this repository.
     */
    public function test_every_offered_operation_is_covered_here(): void
    {
        $covered = array_keys(self::operations());
        $registry = app(Registry::class);
        foreach ($registry->slugs() as $slug) {
            foreach ($registry->for($slug)->definitions() as $definition) {
                $this->assertContains($definition['function']['name'], $covered,
                    $definition['function']['name'].' is offered to the model but never run by a test');
            }
        }
    }

    /**
     * `writes()` is what the catalogue's promise is checked against, so a write that
     * is not declared there is a write the install page swears does not happen - and
     * a connector with no write must say so in the catalogue rather than leaving the
     * sentence to look like an oversight.
     */
    public function test_every_declared_write_is_a_real_operation_and_a_read_only_connector_says_so(): void
    {
        $registry = app(Registry::class);
        foreach ($registry->slugs() as $slug) {
            $connector = $registry->for($slug);
            $offered = array_map(fn ($definition) => $definition['function']['name'], $connector->definitions());
            $writes = $connector->writes();
            foreach ($writes as $write) {
                $this->assertContains($write, $offered, $slug.' declares the write '.$write.' but never offers it');
            }
            $sentence = config('chat_connectors.catalogue.'.$slug.'.writes');
            if ($writes) {
                $this->assertNotEmpty($sentence, $slug.' can change something but the catalogue does not say so');
            } else {
                $this->assertNull($sentence, $slug.' says it changes something in the catalogue but offers no write');
            }
        }
    }
}
