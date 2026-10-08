<?php

namespace Tests\Feature;

use App\Services\Sharing\{SkillFiles, SkillMd};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\SharingFixture;
use Tests\TestCase;

/** Part 17: a standard SKILL.md comes in and goes back out in the same shape; supporting files stay inert and inside the skill folder. */
class SharingSkillMdTest extends TestCase
{
    use RefreshDatabase, SharingFixture;

    private const MD = "---\nname: pdf-notes\ndescription: Turn a PDF into short notes.\nlicense: MIT\nallowed-tools: Bash(rm:*)\n---\n\n# PDF notes\n\nRead the PDF and write five bullets.\n";

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSharing();
    }

    private function preview(string $md, array $files = [], ?string $teammate = null)
    {
        return $this->postJson('/api/sharing/skills/import/preview', array_filter(['skillMd' => $md, 'files' => $files, 'teammateId' => $teammate], fn ($v) => $v !== null));
    }

    private function confirm(string $md, array $files = [], ?string $teammate = null)
    {
        $hash = $this->preview($md, $files, $teammate)->assertOk()->json('plan.planHash');
        return $this->postJson('/api/sharing/skills/import', array_filter(['skillMd' => $md, 'files' => $files, 'teammateId' => $teammate, 'planHash' => $hash, 'confirm' => true], fn ($v) => $v !== null));
    }

    public function test_the_parser_reads_name_description_and_body_and_lists_what_it_ignores(): void
    {
        $p = SkillMd::parse(self::MD);
        $this->assertSame(['pdf-notes', 'Turn a PDF into short notes.', ['license', 'allowed-tools']], [$p['name'], $p['description'], $p['ignored']]);
        $this->assertSame("# PDF notes\n\nRead the PDF and write five bullets.", $p['body']);
    }

    public function test_the_parser_reads_the_usual_yaml_spellings(): void
    {
        $folded = SkillMd::parse("---\nname: \"Deploy: staging\"\ndescription: >\n  Deploy the app\n  to staging.\n---\nGo.");
        $this->assertSame(['Deploy: staging', 'Deploy the app to staging.'], [$folded['name'], $folded['description']]);
        $literal = SkillMd::parse("---\nname: 'it''s'\ndescription: |\n  line one\n  line two\n---\nGo.");
        $this->assertSame(["it's", "line one\nline two"], [$literal['name'], $literal['description']]);
        $crlf = SkillMd::parse("\xEF\xBB\xBF---\r\nname: a\r\ndescription: b # note\r\n---\r\nBody\r\n");
        $this->assertSame(['a', 'b', 'Body'], [$crlf['name'], $crlf['description'], $crlf['body']]);
        $tools = SkillMd::parse("---\nname: a\ndescription: b\nallowed-tools:\n  - Bash\n  - Read\nmetadata:\n  author: x\n---\nBody");
        $this->assertSame(['allowed-tools', 'metadata'], $tools['ignored']);
    }

    public function test_malformed_files_are_refused_with_a_reason(): void
    {
        $cases = ['no frontmatter' => ["# Just text\n", 'skill_md_frontmatter'], 'unclosed' => ["---\nname: a\ndescription: b\nBody", 'skill_md_frontmatter'],
            'no name' => ["---\ndescription: b\n---\nBody", 'skill_md_missing_field'], 'no description' => ["---\nname: a\n---\nBody", 'skill_md_missing_field'],
            'empty body' => ["---\nname: a\ndescription: b\n---\n  \n", 'skill_md_empty'], 'not key value' => ["---\nname a\ndescription: b\n---\nBody", 'skill_md_frontmatter'],
            'duplicate key' => ["---\nname: a\nname: b\ndescription: c\n---\nBody", 'skill_md_frontmatter'],
            'long name' => ["---\nname: ".str_repeat('n', 81)."\ndescription: b\n---\nBody", 'skill_md_name'],
            'long description' => ["---\nname: a\ndescription: ".str_repeat('d', 1025)."\n---\nBody", 'skill_md_description'],
            'body over 4000' => ["---\nname: a\ndescription: b\n---\n".str_repeat('x', 4001), 'skill_instructions_too_long'],
            'binary' => ["---\nname: a\ndescription: b\n---\nBo\0dy", 'skill_md_invalid'], 'too big' => ["---\nname: a\ndescription: b\n---\n".str_repeat('x ', 21000), 'skill_md_invalid']];
        foreach ($cases as $label => [$md, $code]) $this->preview($md)->assertUnprocessable()->assertJsonPath('code', $code);
        $this->assertSame(0, DB::table('agent_skills')->count());
    }

    public function test_preview_shows_what_will_be_created_and_creates_nothing(): void
    {
        $plan = $this->preview(self::MD, [['path' => 'references/style.md', 'content' => 'Short.']])->assertOk()->json('plan');
        $this->assertSame(['name' => 'pdf-notes', 'description' => 'Turn a PDF into short notes.', 'characters' => 49, 'files' => [['path' => 'references/style.md', 'bytes' => 6]]], $plan['skill']);
        $this->assertNull($plan['assignTo']);
        $notes = implode(' ', $plan['notes']);
        $this->assertStringContainsString('never grants a tool', $notes);
        $this->assertStringContainsString('never run', $notes);
        $this->assertStringContainsString('license, allowed-tools', $notes);
        $this->assertSame([0, 0], [DB::table('agent_skills')->count(), DB::table('agent_skill_files')->count()]);
    }

    public function test_confirming_stores_the_skill_with_its_files_and_assigns_it_when_asked(): void
    {
        $agent = $this->teammate();
        $done = $this->confirm(self::MD, [['path' => 'scripts/run.sh', 'content' => "#!/bin/sh\necho hi\n"], ['path' => 'notes.txt', 'content' => '']], $agent['id'])->assertCreated()->json();
        $this->assertSame([[$agent['id']], 'pdf-notes'], [$done['skill']['teammateIds'], $done['skill']['name']]);
        $row = DB::table('agent_skills')->first();
        $this->assertSame(['Turn a PDF into short notes.', "# PDF notes\n\nRead the PDF and write five bullets."], [$row->description, $row->instructions]);
        $this->assertSame(['notes.txt', 'scripts/run.sh'], DB::table('agent_skill_files')->orderBy('path')->pluck('path')->all());
        // A script is kept as text: nothing was written to disk and it never reaches a prompt.
        $this->assertStringNotContainsString('echo hi', \App\Services\Agents\Skills::prompt(DB::table('agent_teammates')->where('id', $agent['id'])->first()));
        $this->assertSame(1, DB::table('agent_skill_assignments')->where('agent_id', $agent['id'])->count());
        $this->assertContains('skill.imported', \App\Models\AccountAuditEvent::pluck('event')->all());
    }

    public function test_path_traversal_and_unsafe_names_in_supporting_files_are_refused(): void
    {
        $bad = ['../secrets.txt', '/etc/passwd', 'a/../../b', 'a/./b', '..', '.', '.env', 'dir/.hidden', 'a//b', 'a\\b', '..\\x', 'C:\\x', '%2e%2e/x', "a\0b",
            'a/b/c/d/e', 'a b.txt', 'é.txt', str_repeat('a', 121), '', 'dir/', 'SKILL.md', 'skill.MD', '~/x', 'a:b', 'a*b', "a\nb"];
        foreach ($bad as $path) {
            $r = $this->preview(self::MD, [['path' => $path, 'content' => 'x']]);
            $this->assertContains($r->status(), [422], 'path '.json_encode($path));
            $this->assertContains($r->json('code') ?? 'validation', ['skill_file_path', 'skill_file_reserved', 'validation'], json_encode($path));
        }
        foreach (['references/a.md', 'a.txt', 'scripts/deploy-1.sh', 'x_y.z', 'a/b/c/d.md'] as $path) $this->assertSame($path, SkillFiles::path($path));
        $this->assertSame(0, DB::table('agent_skill_files')->count());
        $this->assertSame([], glob(storage_path('app/*skill*')));
    }

    public function test_supporting_file_size_count_and_type_caps(): void
    {
        $one = fn (string $path, string $content) => [['path' => $path, 'content' => $content]];
        $this->preview(self::MD, $one('a.md', str_repeat('x', 32000)))->assertOk();
        $this->preview(self::MD, $one('a.md', str_repeat('x', 32001)))->assertUnprocessable()->assertJsonPath('code', 'skill_file_too_large');
        $this->preview(self::MD, $one('a.bin', "PK\0\x03"))->assertUnprocessable()->assertJsonPath('code', 'skill_file_binary');
        $many = array_map(fn ($i) => ['path' => 'f'.$i.'.md', 'content' => 'x'], range(1, 11));
        $this->preview(self::MD, $many)->assertUnprocessable()->assertJsonPath('code', 'skill_files_too_many');
        $together = array_map(fn ($i) => ['path' => 'f'.$i.'.md', 'content' => str_repeat('x', 30000)], range(1, 4));
        $this->preview(self::MD, $together)->assertUnprocessable()->assertJsonPath('code', 'skill_files_too_large');
        $this->preview(self::MD, [['path' => 'A.md', 'content' => 'x'], ['path' => 'a.md', 'content' => 'y']])->assertUnprocessable()->assertJsonPath('code', 'skill_file_duplicate');
    }

    public function test_a_skill_with_a_secret_is_refused_without_echoing_it(): void
    {
        $md = "---\nname: a\ndescription: b\n---\nUse AKIAJ3Q7ZB5N2XWV4LTR to call the API.";
        $r = $this->preview($md)->assertUnprocessable()->assertJsonPath('code', 'skill_has_secret');
        $this->assertStringNotContainsString('AKIAJ3Q7ZB5N2XWV4LTR', $r->getContent());
        $r = $this->preview(self::MD, [['path' => 'env.txt', 'content' => 'API_KEY=AKIAJ3Q7ZB5N2XWV4LTR']])->assertUnprocessable()->assertJsonPath('code', 'skill_has_secret');
        $this->assertStringNotContainsString('AKIAJ3Q7ZB5N2XWV4LTR', $r->getContent());
    }

    public function test_assignment_limits_and_ownership(): void
    {
        $agent = $this->teammate();
        for ($i = 0; $i < 20; $i++) $this->skill('S'.$i, 'x', [$agent['id']]);
        $this->preview(self::MD, [], $agent['id'])->assertUnprocessable()->assertJsonPath('code', 'teammate_skill_limit');
        $other = \App\Models\User::factory()->create();
        app(\App\Services\Vibes\Wallet::class)->ensure($other);
        $theirs = $this->teammate('Theirs', [], $other);
        $this->preview(self::MD, [], $theirs['id'])->assertNotFound();
        $this->preview(self::MD, [], (string) Str::uuid())->assertNotFound();
        DB::table('agent_skills')->where('name', 'like', 'S%')->delete();
        $this->preview(self::MD, [], $agent['id'])->assertOk();
    }

    public function test_the_confirm_must_match_the_preview_and_the_library_has_a_limit(): void
    {
        $hash = $this->preview(self::MD)->json('plan.planHash');
        $this->postJson('/api/sharing/skills/import', ['skillMd' => str_replace('five', 'six', self::MD), 'planHash' => $hash, 'confirm' => true])->assertStatus(409)->assertJsonPath('code', 'plan_changed');
        $this->postJson('/api/sharing/skills/import', ['skillMd' => self::MD, 'planHash' => $hash])->assertUnprocessable();
        for ($i = 0; $i < 100; $i++) DB::table('agent_skills')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'name' => 'S'.$i, 'instructions' => 'x', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->preview(self::MD)->assertUnprocessable()->assertJsonPath('code', 'skill_library_full');
    }

    public function test_export_gives_the_same_shape_back_and_it_round_trips(): void
    {
        $agent = $this->teammate();
        $done = $this->confirm(self::MD, [['path' => 'references/style.md', 'content' => "Short.\n"]], $agent['id'])->assertCreated()->json('skill');
        $export = $this->getJson('/api/sharing/skills/'.$done['id'].'/export')->assertOk()->json('export');
        $this->assertSame('pdf-notes', $export['folder']);
        $this->assertSame(['SKILL.md', 'references/style.md'], array_column($export['files'], 'path'));
        $md = $export['files'][0]['content'];
        $this->assertStringStartsWith("---\nname: pdf-notes\ndescription: Turn a PDF into short notes.\n---\n", $md);
        $again = SkillMd::parse($md);
        $this->assertSame(['pdf-notes', 'Turn a PDF into short notes.', "# PDF notes\n\nRead the PDF and write five bullets."], [$again['name'], $again['description'], $again['body']]);
        // Import the export into a clean account state: the same skill, the same files.
        DB::table('agent_skills')->delete();
        $second = $this->confirm($md, [$export['files'][1]])->assertCreated()->json('skill');
        $this->assertSame($done['name'], $second['name']);
        $this->assertSame('Short.', trim(DB::table('agent_skill_files')->value('content')));
    }

    public function test_export_quotes_awkward_names_and_fills_a_missing_description(): void
    {
        $skill = $this->skill('Deploy: "staging" #1', "# Deploy\nShip it.");
        $md = $this->getJson('/api/sharing/skills/'.$skill['id'].'/export')->assertOk()->json('export.files.0.content');
        $parsed = SkillMd::parse($md);
        $this->assertSame(['Deploy: "staging" #1', 'Deploy'], [$parsed['name'], $parsed['description']]);
    }

    public function test_export_masks_secrets_and_is_scoped_to_the_owner(): void
    {
        $skill = $this->skill('Env', 'Use API_KEY=AKIAJ3Q7ZB5N2XWV4LTR here.');
        $export = $this->getJson('/api/sharing/skills/'.$skill['id'].'/export')->assertOk()->json('export');
        $this->assertStringNotContainsString('AKIAJ3Q7ZB5N2XWV4LTR', json_encode($export));
        $this->assertGreaterThanOrEqual(1, $export['redactions']);
        $this->signedIn('other-session');
        $this->getJson('/api/sharing/skills/'.$skill['id'].'/export')->assertNotFound();
    }
}
