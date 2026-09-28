<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Request;
use Tests\TestCase;

class OpenRouterModelReleasesTest extends TestCase
{
    use RefreshDatabase;

    private array $models = [];

    private int $discordStatus = 204;

    private const SOURCE = 'https://openrouter.test/models';

    private const WEBHOOK = 'https://discord.com/api/webhooks/123/test-token';

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'model_releases.source_url' => self::SOURCE,
            'model_releases.discord_webhook_url' => self::WEBHOOK,
        ]);
        Http::fake(function (Request $request) {
            if ($request->url() === self::SOURCE) {
                return Http::response(['data' => $this->models]);
            }

            return Http::response(null, $this->discordStatus);
        });
    }

    private function roster(array $models): void
    {
        $this->models = $models;
    }

    public function test_first_roster_is_silent_and_new_base_model_is_announced_once(): void
    {
        $this->roster([['id' => 'openai/old', 'name' => 'Old']]);
        $this->artisan('vibyra:sync-openrouter-model-releases')->assertExitCode(0);
        $this->assertNull(DB::table('openrouter_model_releases')->first()->released_at);
        Http::assertSentCount(1);

        $this->roster([
            ['id' => 'openai/old', 'name' => 'Old'],
            ['id' => 'openai/new', 'name' => 'New'],
            ['id' => 'openai/new:free', 'name' => 'New Free'],
        ]);
        $this->artisan('vibyra:sync-openrouter-model-releases')->assertExitCode(0);
        $this->artisan('vibyra:sync-openrouter-model-releases')->assertExitCode(0);

        $this->assertDatabaseCount('openrouter_model_releases', 2);
        $this->assertNotNull(DB::table('openrouter_model_releases')->where('model_id', 'openai/new')->value('discord_delivered_at'));
        Http::assertSentCount(4);
        Http::assertSent(fn ($request) => $request->url() === self::WEBHOOK
            && $request['allowed_mentions']['parse'] === []);
    }

    public function test_feed_initializes_silently_then_pages_only_releases(): void
    {
        $this->roster([['id' => 'openai/old', 'name' => 'Old']]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->get('/web-api/openrouter/releases')
            ->assertOk()->assertJsonPath('cursor', 1)->assertJsonCount(0, 'releases');

        $this->roster([
            ['id' => 'openai/old', 'name' => 'Old'],
            ['id' => 'openai/new', 'name' => 'New'],
        ]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $newCursor = (int) DB::table('openrouter_model_releases')->where('model_id', 'openai/new')->value('id');
        $this->get('/web-api/openrouter/releases?after=1')
            ->assertOk()->assertJsonPath('cursor', $newCursor)
            ->assertJsonPath('releases.0.id', 'openai/new');
        $this->get('/web-api/openrouter/releases?after='.$newCursor)
            ->assertOk()->assertJsonCount(0, 'releases');
    }

    public function test_failed_or_ambiguous_discord_delivery_is_not_retried(): void
    {
        $this->roster([['id' => 'openai/old', 'name' => 'Old']]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->roster([
            ['id' => 'openai/old', 'name' => 'Old'],
            ['id' => 'openai/new', 'name' => 'New'],
        ]);
        $this->discordStatus = 500;
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->artisan('vibyra:sync-openrouter-model-releases');

        Http::assertSentCount(4);
        $new = DB::table('openrouter_model_releases')->where('model_id', 'openai/new')->first();
        $this->assertNotNull($new->discord_attempted_at);
        $this->assertNull($new->discord_delivered_at);
    }

    public function test_a_removed_then_restored_model_is_not_a_second_release(): void
    {
        $this->roster([['id' => 'openai/old', 'name' => 'Old']]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->roster([
            ['id' => 'openai/old', 'name' => 'Old'],
            ['id' => 'openai/new', 'name' => 'New'],
        ]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->roster([['id' => 'openai/old', 'name' => 'Old']]);
        $this->artisan('vibyra:sync-openrouter-model-releases');
        $this->roster([
            ['id' => 'openai/old', 'name' => 'Old'],
            ['id' => 'openai/new', 'name' => 'New'],
        ]);
        $this->artisan('vibyra:sync-openrouter-model-releases');

        $this->assertDatabaseCount('openrouter_model_releases', 2);
        $newCursor = (int) DB::table('openrouter_model_releases')->where('model_id', 'openai/new')->value('id');
        $this->get('/web-api/openrouter/releases?after='.$newCursor)
            ->assertOk()->assertJsonCount(0, 'releases');
    }

    public function test_empty_or_failed_roster_does_not_create_a_baseline(): void
    {
        $this->roster([]);
        $this->artisan('vibyra:sync-openrouter-model-releases')->assertExitCode(1);
        $this->assertDatabaseCount('openrouter_model_releases', 0);
        $this->get('/web-api/openrouter/releases?after=invalid')->assertStatus(422);
    }

    public function test_feed_pages_after_the_last_delivered_cursor(): void
    {
        DB::table('openrouter_model_releases')->insert([
            'model_id' => 'openai/baseline', 'name' => 'Baseline', 'released_at' => null,
        ]);
        for ($index = 0; $index < 101; $index++) {
            DB::table('openrouter_model_releases')->insert([
                'model_id' => "openai/model-{$index}",
                'name' => "Model {$index}",
                'released_at' => now(),
            ]);
        }

        $first = $this->get('/web-api/openrouter/releases?after=1')->assertOk()
            ->assertJsonCount(100, 'releases')->json();
        $this->assertSame($first['releases'][99]['cursor'], $first['cursor']);
        $this->get('/web-api/openrouter/releases?after='.$first['cursor'])
            ->assertOk()->assertJsonCount(1, 'releases')
            ->assertJsonPath('releases.0.id', 'openai/model-100');
    }
}
