<?php

namespace Tests\Feature;

use App\Services\Integrations\Registry;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every tool every connector offers, run once against a recorded answer.
 *
 * The point is not that a provider works — that is their job, and the live smoke
 * command is where it is proved. The point is that the code between the model and
 * the provider is exercised at all: that `validate` accepts the arguments the
 * schema advertises, that `run` sends the verb and path the provider documents,
 * and that what comes back is reshaped into something a model can read rather
 * than passed through raw.
 *
 * `test_every_offered_operation_is_covered_here` is what keeps this honest. A
 * connector that grows a new tool and no case for it fails that test, so the
 * table below cannot quietly fall behind the schemas it is meant to cover.
 */
class ConnectorOperationsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['integrations.enabled' => true]);
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
            ['github', 'github_recent_commits', ['repository' => 'ellis/app'], 'api.github.com/repos/*', [[
                ['sha' => 'abcdef1234', 'commit' => ['message' => "Fix the crash\n\nDetails", 'author' => ['name' => 'Ellis', 'date' => '2026-09-01T00:00:00Z']]],
            ]], 'Read the latest commits on ellis/app'],
            ['github', 'github_create_issue', ['repository' => 'ellis/app', 'title' => 'It crashes', 'body' => 'On launch.'],
                'api.github.com/repos/*', [['number' => 12, 'title' => 'It crashes', 'html_url' => 'https://github.com/ellis/app/issues/12']],
                'Opened issue #12 on ellis/app'],

            // --- Stripe -------------------------------------------------------
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
        foreach ($bodies as $body) $sequence->push($body);
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
        ];

        foreach ($expected as $slug => [$operation, $arguments, $pattern, $bodies, $method, $url, $payload]) {
            $sequence = Http::sequence();
            foreach ($bodies as $body) $sequence->push($body);
            Http::fake([$pattern => $sequence->whenEmpty(Http::response($bodies[count($bodies) - 1]))]);

            $connector = app(Registry::class)->for($slug);
            $connector->run($operation, $connector->validate($operation, $arguments), 'test-credential');

            Http::assertSent(function ($request) use ($method, $url, $payload) {
                if ($request->method() !== $method || $request->url() !== $url) return false;
                foreach ((array) $payload as $key => $value) {
                    if (($request->data()[$key] ?? null) !== $value) return false;
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
     * is not declared there is a write the install page swears does not happen.
     */
    public function test_every_declared_write_is_a_real_operation_and_every_connector_has_one(): void
    {
        $registry = app(Registry::class);
        foreach ($registry->slugs() as $slug) {
            $connector = $registry->for($slug);
            $offered = array_map(fn ($definition) => $definition['function']['name'], $connector->definitions());
            $writes = $connector->writes();
            $this->assertNotEmpty($writes, $slug.' offers no write, but the catalogue says every integration can change something');
            foreach ($writes as $write) {
                $this->assertContains($write, $offered, $slug.' declares the write '.$write.' but never offers it');
            }
        }
    }
}
