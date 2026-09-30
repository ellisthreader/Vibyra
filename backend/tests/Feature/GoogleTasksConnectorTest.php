<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Recorded provider responses for every Google Tasks operation offered to the model. */
final class GoogleTasksConnectorTest extends TestCase
{
    public static function operations(): array
    {
        return [
            'google_tasks_lists' => ['google_tasks_lists', [], 'GET',
                'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
                ['items' => [['id' => 'list123', 'title' => 'My Tasks']]],
                'Listed 1 Google Tasks lists'],
            'google_tasks_list' => ['google_tasks_list', ['listId' => 'list123'], 'GET',
                'https://tasks.googleapis.com/tasks/v1/lists/list123/tasks',
                ['items' => [['id' => 'task123', 'title' => 'Review plan', 'status' => 'needsAction']]],
                'Read 1 Google Tasks'],
            'google_tasks_create' => ['google_tasks_create',
                ['listId' => 'list123', 'title' => 'Review plan', 'due' => '2026-10-01'], 'POST',
                'https://tasks.googleapis.com/tasks/v1/lists/list123/tasks',
                ['id' => 'task456', 'title' => 'Review plan'],
                'Created Google Task Review plan'],
        ];
    }

    #[DataProvider('operations')]
    public function test_each_offered_operation_validates_and_calls_the_documented_endpoint(
        string $operation, array $arguments, string $method, string $url,
        array $body, string $summary): void
    {
        Http::fake([$url.'*' => Http::response($body)]);
        $connector = app(Registry::class)->for('google_tasks');
        $safe = $connector->validate($operation, $arguments);
        $outcome = $connector->run($operation, $safe, 'test-credential');

        self::assertIsArray($outcome['result']);
        self::assertArrayNotHasKey('error', $outcome['result']);
        self::assertStringContainsString($summary, $outcome['summary']);
        Http::assertSent(fn ($request) => $request->method() === $method
            && strtok($request->url(), '?') === $url);
        if ($operation === 'google_tasks_create') {
            Http::assertSent(fn ($request) => $request->method() === 'POST'
                && $request['title'] === 'Review plan'
                && $request['due'] === '2026-10-01T00:00:00.000Z');
        }
    }
}
