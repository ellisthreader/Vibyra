<?php

namespace Tests\Feature;

use App\Models\AccountAuditEvent;
use App\Services\Sharing\Bundle\BundleReader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\SharingFixture;
use Tests\TestCase;

/** Part 17: teammate export/import bundles (versioned, secret-free, previewed before they create anything). */
class SharingBundleTest extends TestCase
{
    use RefreshDatabase, SharingFixture;

    private const KEY = 'AKIAJ3Q7ZB5N2XWV4LTR';

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSharing();
    }

    private function preview(array $bundle)
    {
        return $this->postJson('/api/sharing/teammates/import/preview', ['bundle' => $bundle]);
    }

    private function confirm(array $bundle, ?string $id = null, ?string $hash = null)
    {
        $hash ??= $this->preview($bundle)->assertOk()->json('plan.planHash');
        return $this->postJson('/api/sharing/teammates/import', ['bundle' => $bundle, 'id' => $id ?? (string) Str::uuid(), 'planHash' => $hash, 'confirm' => true]);
    }

    public function test_everything_is_off_by_default(): void
    {
        config(['sharing.bundles' => false]);
        $agent = $this->teammate();
        $this->getJson('/api/sharing/teammates/'.$agent['id'].'/export')->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->preview($this->bundle())->assertNotFound();
        $this->postJson('/api/sharing/skills/import/preview', ['skillMd' => "---\nname: a\ndescription: b\n---\nc"])->assertNotFound();
        $this->getJson('/api/sharing/status')->assertOk()->assertJsonPath('bundles', false);
    }

    public function test_export_carries_the_profile_skills_and_templates_but_never_credentials_or_ids(): void
    {
        $agent = $this->teammate('Release helper', ['memory' => 'My private memory about Sam.']);
        $skill = $this->skill('Changelog', 'List what changed.', [$agent['id']]);
        DB::table('agent_skills')->where('id', $skill['id'])->update(['description' => 'Write a changelog.']);
        DB::table('agent_skill_files')->insert(['skill_id' => $skill['id'], 'path' => 'references/style.md', 'content' => 'Short lines.', 'bytes' => 12]);
        $connection = (string) Str::uuid();
        DB::table('agent_connections')->insert(['id' => $connection, 'user_id' => $this->user->id, 'provider' => 'github', 'external_identity' => '@me',
            'credential' => 'ghp_secretsecretsecretsecretsecretsecret1234', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_grants')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'agent_id' => $agent['id'], 'connection_id' => $connection,
            'operations' => '["github_read_issue"]', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_triggers')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'agent_id' => $agent['id'], 'kind' => 'github.pull_request',
            'filter' => json_encode(['actions' => ['opened']]), 'prompt_template' => 'A pull request opened.', 'rate_per_hour' => 10, 'secret' => 'encrypted-signing-secret',
            'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_schedules')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'agent_id' => $agent['id'], 'conversation_id' => $agent['chatId'],
            'title' => 'Friday notes', 'prompt' => 'Draft the notes.', 'timezone' => 'Europe/London', 'recurrence' => json_encode(['type' => 'weekly', 'weekdays' => [5], 'time' => '16:00']),
            'revision' => 1, 'overlap' => 'skip', 'catch_up_minutes' => 60, 'created_at' => now(), 'updated_at' => now()]);

        $export = $this->getJson('/api/sharing/teammates/'.$agent['id'].'/export')->assertOk()->json('export');
        $bundle = json_decode($export['content'], true);
        $this->assertSame(['vibyra.teammate', 1], [$bundle['format'], $bundle['schemaVersion']]);
        $this->assertSame(['name' => 'Release helper', 'brief' => 'Review pull requests.', 'avatar' => 'review'], $bundle['teammate']);
        $this->assertSame('Write a changelog.', $bundle['skills'][0]['description']);
        $this->assertSame('references/style.md', $bundle['skills'][0]['files'][0]['path']);
        $this->assertSame(['github'], $bundle['connectionSlots']);
        $this->assertSame('github.pull_request', $bundle['triggers'][0]['kind']);
        $this->assertSame('weekly', $bundle['routines'][0]['recurrence']['type']);
        $text = $export['content'];
        foreach (['memory', 'ghp_', 'encrypted-signing', $connection, $agent['id'], $agent['chatId'], 'credential', 'secret', 'webhook', $this->user->email] as $forbidden)
            $this->assertStringNotContainsString($forbidden, $text, $forbidden);
        $this->assertSame(['teammate.exported'], AccountAuditEvent::pluck('event')->all());
        // What it exports is what it reads back.
        $this->assertSame(200, $this->preview($bundle)->status());
    }

    public function test_export_runs_through_the_secret_guard(): void
    {
        $agent = $this->teammate('Deployer', ['brief' => 'Deploy with key '.self::KEY.' when asked.']);
        $this->skill('Env', "Use API_KEY=".self::KEY." for the call.", [$agent['id']]);
        $export = $this->getJson('/api/sharing/teammates/'.$agent['id'].'/export')->assertOk()->json('export');
        $this->assertStringNotContainsString(self::KEY, $export['content']);
        $this->assertStringContainsString('[redacted:', $export['content']);
        $this->assertGreaterThanOrEqual(2, $export['redactions']);
        // A redacted export imports cleanly: it no longer holds a secret.
        $this->preview(json_decode($export['content'], true))->assertOk();
    }

    public function test_another_accounts_teammate_cannot_be_exported(): void
    {
        $other = \App\Models\User::factory()->create();
        app(\App\Services\Vibes\Wallet::class)->ensure($other);
        $theirs = $this->teammate('Theirs', [], $other);
        $this->getJson('/api/sharing/teammates/'.$theirs['id'].'/export')->assertNotFound();
    }

    public function test_preview_says_exactly_what_will_be_created_and_creates_nothing(): void
    {
        $plan = $this->preview($this->bundle())->assertOk()->json('plan');
        $this->assertSame(['name' => 'Release helper', 'brief' => 'Keep releases tidy.', 'avatar' => 'lead'], $plan['teammate']);
        $this->assertSame([['name' => 'Changelog', 'description' => 'Write a changelog.', 'characters' => 32, 'files' => 0, 'assigned' => true]], $plan['skills']);
        $this->assertSame('Friday notes', $plan['suggestions']['routines'][0]['title']);
        $this->assertSame('github.pull_request', $plan['suggestions']['triggers'][0]['kind']);
        $this->assertSame(['github'], $plan['connectionSlots']);
        $this->assertStringContainsString('No connections, grants, tokens or memory', implode(' ', $plan['notes']));
        $this->assertSame(0, DB::table('agent_teammates')->where('user_id', $this->user->id)->count());
        $this->assertSame(0, DB::table('agent_skills')->count());
    }

    public function test_confirming_creates_the_teammate_and_skills_only_and_never_a_grant_routine_trigger_or_connection(): void
    {
        $done = $this->confirm($this->bundle())->assertCreated()->json();
        $this->assertSame('Release helper', $done['teammate']['name']);
        $this->assertSame(['integrations' => [], 'memory' => ''], ['integrations' => $done['teammate']['integrations'], 'memory' => $done['teammate']['memory']]);
        $this->assertCount(1, $done['teammate']['skillIds']);
        $this->assertSame(1, $done['created']['skills']);
        $this->assertSame('Friday notes', $done['suggestions']['routines'][0]['title']);
        foreach (['agent_grants', 'agent_connections', 'agent_schedules', 'agent_triggers', 'agent_runtime_bindings'] as $table) $this->assertSame(0, DB::table($table)->count(), $table);
        $this->assertSame('Write a changelog.', DB::table('agent_skills')->value('description'));
        $this->assertContains('teammate.imported', AccountAuditEvent::pluck('event')->all());
    }

    public function test_a_retried_confirm_returns_the_same_teammate_and_creates_nothing_more(): void
    {
        $bundle = $this->bundle();
        $id = (string) Str::uuid();
        $hash = $this->preview($bundle)->json('plan.planHash');
        $first = $this->confirm($bundle, $id, $hash)->assertCreated()->json('teammate.id');
        $second = $this->confirm($bundle, $id, $hash)->assertOk();
        $this->assertSame([$first, true], [$second->json('teammate.id'), $second->json('already')]);
        $this->assertSame([1, 1], [DB::table('agent_teammates')->count(), DB::table('agent_skills')->count()]);
        // Someone else's id is not reusable.
        $this->signedIn('other-session');
        $this->confirm($bundle, $id, $hash)->assertStatus(409)->assertJsonPath('code', 'import_conflict');
    }

    public function test_confirm_needs_the_hash_of_the_bundle_that_was_previewed(): void
    {
        $hash = $this->preview($this->bundle())->json('plan.planHash');
        $changed = $this->bundle(['teammate' => ['brief' => 'Something else entirely.']]);
        $this->confirm($changed, null, $hash)->assertStatus(409)->assertJsonPath('code', 'plan_changed');
        $this->postJson('/api/sharing/teammates/import', ['bundle' => $this->bundle(), 'id' => (string) Str::uuid(), 'planHash' => $hash])->assertUnprocessable();
        $this->assertSame(0, DB::table('agent_teammates')->count());
    }

    public function test_it_needs_agents_switched_on_and_pro_like_creating_a_teammate_by_hand(): void
    {
        config(['agents.enabled' => false]);
        $this->preview($this->bundle())->assertStatus(503);
        config(['agents.enabled' => true]);
        config(['vibes.plan_limits_enabled' => true, 'membership.trial_days' => 0]);
        $this->preview($this->bundle())->assertStatus(402)->assertJsonPath('code', 'pro_required');
    }

    public function test_it_needs_a_signed_in_account(): void
    {
        $this->withToken('');
        $this->preview($this->bundle())->assertUnauthorized();
        $this->getJson('/api/sharing/teammates/'.Str::uuid().'/export')->assertUnauthorized();
    }
}
