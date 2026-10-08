<?php

namespace Tests\Feature;

use App\Models\AccountAuditEvent;
use App\Services\Sharing\Bundle\BundleReader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\SharingFixture;
use Tests\TestCase;

/** Part 17: the bundle schema is strict (versions, fields, sizes, avatars, credentials, secrets, library limits). */
class SharingBundleSchemaTest extends TestCase
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

    public function test_the_schema_is_strict(): void
    {
        $cases = [
            'not a bundle' => [['hello' => 'world'], 'bundle_invalid'],
            'newer version' => [$this->bundle(['schemaVersion' => 2]), 'bundle_version_unsupported'],
            'string version' => [$this->bundle(['schemaVersion' => '1']), 'bundle_version_unsupported'],
            'unknown top-level field' => [$this->bundle(['extra' => 1]), 'bundle_unknown_field'],
            'unknown teammate field' => [$this->bundle(['teammate' => ['model' => 'x']]), 'bundle_unknown_field'],
            'unknown avatar' => [$this->bundle(['teammate' => ['avatar' => 'robot']]), 'bundle_unknown_avatar'],
            'empty name' => [$this->bundle(['teammate' => ['name' => '  ']]), 'bundle_invalid'],
            'name too long' => [$this->bundle(['teammate' => ['name' => str_repeat('n', 81)]]), 'bundle_invalid'],
            'brief too long' => [$this->bundle(['teammate' => ['brief' => str_repeat('b', 4001)]]), 'bundle_invalid'],
            'skill without instructions' => [$this->bundleWith('skills', [['name' => 'A']]), 'bundle_invalid'],
            'duplicate skill names' => [$this->bundleWith('skills', [['name' => 'A', 'instructions' => 'x'], ['name' => 'a', 'instructions' => 'y']]), 'bundle_invalid'],
            'one-off routine' => [$this->bundleWith('routines', [['prompt' => 'x', 'timezone' => 'Europe/London', 'recurrence' => ['type' => 'once', 'date' => '2030-01-01', 'time' => '09:00']]]), 'bundle_invalid'],
            'bad timezone' => [$this->bundleWith('routines', [['prompt' => 'x', 'timezone' => 'Mars/Base', 'recurrence' => ['type' => 'daily', 'time' => '09:00']]]), 'bundle_invalid'],
            'unknown trigger kind' => [$this->bundleWith('triggers', [['kind' => 'shell.run', 'promptTemplate' => 'x']]), 'bundle_invalid'],
            'bad connection slot' => [$this->bundleWith('connectionSlots', ['GitHub token!']), 'bundle_invalid'],
            'slots not a list' => [$this->bundleWith('connectionSlots', ['a' => 'github']), 'bundle_invalid'],
        ];
        foreach ($cases as $label => [$bundle, $code]) $this->preview($bundle)->assertUnprocessable()->assertJsonPath('code', $code);
        $this->assertSame(0, DB::table('agent_teammates')->count());
    }

    public function test_the_avatar_list_matches_the_teammate_endpoint(): void
    {
        foreach (BundleReader::AVATARS as $slug) {
            $this->postJson('/api/agents/v1/teammates', ['id' => (string) Str::uuid(), 'name' => 'A', 'brief' => 'B', 'memory' => '', 'avatar' => $slug, 'budget' => 5,
                'integrations' => []])->assertOk();
        }
        $this->postJson('/api/agents/v1/teammates', ['id' => (string) Str::uuid(), 'name' => 'A', 'brief' => 'B', 'memory' => '', 'avatar' => 'robot', 'budget' => 5,
            'integrations' => []])->assertUnprocessable();
    }

    public function test_size_and_count_caps(): void
    {
        $skills = fn (int $n) => array_map(fn ($i) => ['name' => 'Skill '.$i, 'instructions' => 'x'], range(1, $n));
        $this->preview($this->bundleWith('skills', $skills(100)))->assertOk();
        $this->preview($this->bundleWith('skills', $skills(101)))->assertUnprocessable()->assertJsonPath('code', 'bundle_too_many_skills');
        $big = $this->bundleWith('skills', array_map(fn ($i) => ['name' => 'S'.$i, 'instructions' => str_repeat('a', 3900)], range(1, 30)));
        $this->preview($big)->assertUnprocessable()->assertJsonPath('code', 'bundle_too_large');
        $this->preview($this->bundleWith('routines', array_fill(0, 11, $this->bundle()['routines'][0])))->assertUnprocessable()->assertJsonPath('code', 'bundle_too_many_routines');
        $this->preview($this->bundleWith('triggers', array_fill(0, 11, $this->bundle()['triggers'][0])))->assertUnprocessable()->assertJsonPath('code', 'bundle_too_many_triggers');
        $this->preview($this->bundleWith('connectionSlots', array_map(fn ($i) => 'prov'.$i, range(1, 21))))->assertUnprocessable()->assertJsonPath('code', 'bundle_too_many_slots');
    }

    public function test_a_bundle_that_carries_credentials_grants_or_tokens_is_refused(): void
    {
        $with = fn (string $key) => $this->bundle(['teammate' => [$key => 'x']]);
        foreach (['accessToken', 'grants', 'credential', 'apiKey', 'password', 'connectionId', 'runtimeId', 'signingSecret', 'cookie'] as $key)
            $this->preview($with($key))->assertUnprocessable()->assertJsonPath('code', 'bundle_has_credentials');
        $this->preview($this->bundle(['triggers' => [['kind' => 'github.issue', 'promptTemplate' => 'x', 'secret' => 'whsec_x']]]))->assertUnprocessable()
            ->assertJsonPath('code', 'bundle_has_credentials');
        $this->preview($this->bundleWith('grants', [['connectionId' => (string) Str::uuid()]]))->assertUnprocessable()->assertJsonPath('code', 'bundle_has_credentials');
    }

    public function test_a_bundle_holding_secret_text_is_refused_without_echoing_it(): void
    {
        $r = $this->preview($this->bundle(['skills' => [['instructions' => 'Call it with '.self::KEY]]]))->assertUnprocessable()->assertJsonPath('code', 'bundle_has_secret');
        $this->assertStringNotContainsString(self::KEY, $r->getContent());
        $r = $this->preview($this->bundle(['routines' => [['prompt' => 'password = hunter2hunter2hunter2']]]));
        $r->assertUnprocessable();
        $this->assertStringNotContainsString('hunter2', $r->getContent());
    }

    public function test_skill_library_and_teammate_limits_apply_and_only_twenty_skills_are_assigned(): void
    {
        for ($i = 0; $i < 90; $i++) DB::table('agent_skills')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'name' => 'Old '.$i, 'instructions' => 'x', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $skills = array_map(fn ($i) => ['name' => 'New '.$i, 'instructions' => 'x'], range(1, 11));
        $this->preview($this->bundleWith('skills', $skills))->assertUnprocessable()->assertJsonPath('code', 'skill_library_full');
        $ten = array_map(fn ($i) => ['name' => 'New '.$i, 'instructions' => 'x'], range(1, 10));
        $plan = $this->preview($this->bundleWith('skills', $ten))->assertOk()->json('plan');
        $this->assertCount(10, $plan['skills']);
        DB::table('agent_skills')->where('name', 'like', 'Old%')->delete();
        $thirty = array_map(fn ($i) => ['name' => 'Many '.$i, 'instructions' => 'x'], range(1, 30));
        $plan = $this->preview($this->bundleWith('skills', $thirty))->assertOk()->json('plan');
        $this->assertSame([20, 10], [count(array_filter($plan['skills'], fn ($s) => $s['assigned'])), count(array_filter($plan['skills'], fn ($s) => !$s['assigned']))]);
        $done = $this->confirm($this->bundleWith('skills', $thirty))->assertCreated()->json();
        $this->assertCount(20, $done['teammate']['skillIds']);
        $this->assertSame(30, DB::table('agent_skills')->count());
        config(['agents.max_teammates' => 1]);
        $this->preview($this->bundle())->assertUnprocessable()->assertJsonPath('code', 'teammate_limit');
    }
}
