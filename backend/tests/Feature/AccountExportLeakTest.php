<?php

namespace Tests\Feature;

use App\Models\{AccountExport, User};
use App\Services\Account\AccountDeletion;
use App\Services\Platform\AccountActivity;
use App\Services\Privacy\{AccountExports, ExportScrub};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Tests\Support\{AccountExportFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Roadmap Part 19: nothing secret and nothing of anyone else's is in the archive, and deleting the account removes it. */
class AccountExportLeakTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AccountExportFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        Storage::fake('local');
        config(['reliability.export.enabled' => true, 'platform.activity' => true, 'reliability.export.disk' => 'local']);
    }

    public function test_deleting_the_account_removes_the_export_rows_and_files(): void
    {
        $this->postJson('/api/account/export')->assertStatus(202);
        $path = AccountExport::first()->path;
        $id = $this->user->id;
        $this->assertTrue(app(AccountDeletion::class)->delete($this->user));
        $this->assertSame(0, AccountExport::where('user_id', $id)->count());
        Storage::disk('local')->assertMissing($path);
        $this->assertSame([], Storage::disk('local')->allFiles(AccountExports::directory($id)));
    }

    public function test_nothing_secret_and_nothing_of_anyone_elses_is_in_the_archive(): void
    {
        $this->seedAccount();
        $other = User::factory()->create(['name' => 'Olive Other', 'email' => 'olive.other@example.test']);
        DB::table('vibes_chats')->insert(['id' => (string) Str::uuid(), 'user_id' => $other->id, 'title' => 'OTHER-PERSONS-CHAT', 'revision' => 1,
            'created_at' => now(), 'updated_at' => now()]);
        AccountActivity::record($other, 'sign_in', ['channel' => 'OTHER-PERSONS-ACTIVITY']);
        $this->gmailInstall('me@example.test', 'gmail-token-CANARY');
        DB::table('users')->where('id', $this->user->id)->update(['remember_token' => 'CANARY_REMEMBER_TOKEN', 'provider_id' => 'CANARY_PROVIDER_ID',
            'stripe_customer_id' => 'cus_CANARYCUSTOMER', 'stripe_subscription_id' => 'sub_CANARYSUB']);
        $this->user->refresh()->forceFill(['app_state' => [...$this->user->app_state, 'apiToken' => 'CANARY_APP_TOKEN', 'nested' => ['password' => 'CANARY_NESTED_PW',
            'keep' => 'fine'], 'pasted' => 'my key is sk-CANARYABCDEFGHIJKLMNOP1234 ok', 'jwt' => 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop']])->save();
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['integrations' => '{"canary":"CANARY_INTEGRATIONS_BLOB"}']);
        DB::table('webhook_endpoints')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'url' => 'https://hooks.example.test/x',
            'secret' => 'CANARY_WEBHOOK_SECRET', 'events' => '[]', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('api_keys')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'name' => 'ci', 'prefix' => 'vyk_abcd', 'key_hash' => hash('sha256', 'CANARY_API_KEY'),
            'scopes' => '["runs:read"]', 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/account/export')->assertStatus(202);
        $all = implode("\n", $this->archive());

        $secrets = ['CANARY_REMEMBER_TOKEN', 'CANARY_PROVIDER_ID', 'cus_CANARYCUSTOMER', 'sub_CANARYSUB', 'CANARY_APP_TOKEN', 'CANARY_NESTED_PW',
            'sk-CANARYABCDEFGHIJKLMNOP1234', 'eyJhbGciOiJIUzI1NiJ9', 'CANARY_INTEGRATIONS_BLOB', 'CANARY_WEBHOOK_SECRET', hash('sha256', 'CANARY_API_KEY'),
            'gmail-token-CANARY', 'CANARY_TURN_REQUEST', 'gen-CANARYGEN', 'v2-session', hash('sha256', 'v2-session')];
        foreach ($secrets as $secret) $this->assertStringNotContainsString($secret, $all, "leaked: $secret");
        // Every credential-looking column of the account's own user row: whatever it holds must not be in the archive.
        $row = (array) DB::table('users')->where('id', $this->user->id)->first();
        foreach ($row as $column => $value) {
            if (preg_match('/password|token|secret|hash|stripe|provider_id|two_factor|recovery/i', $column) && is_string($value) && strlen($value) > 5)
                $this->assertStringNotContainsString($value, $all, "users.$column leaked");
        }
        foreach (['OTHER-PERSONS-CHAT', 'OTHER-PERSONS-ACTIVITY', 'olive.other@example.test', 'Olive Other'] as $theirs)
            $this->assertStringNotContainsString($theirs, $all, "someone else's data: $theirs");
        $this->assertStringContainsString('fine', $all); // ordinary settings survive the scrub
        $this->assertStringContainsString(ExportScrub::REMOVED, $all);
    }

    public function test_the_scrub_keeps_ordinary_words_and_drops_credential_shapes(): void
    {
        $this->assertSame('skateboarding enthusiastic words', ExportScrub::text('skateboarding enthusiastic words'));
        $this->assertSame('a [removed] b', ExportScrub::text('a vyk_'.str_repeat('A', 40).' b'));
        $this->assertSame('x [removed]', ExportScrub::text("x -----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"));
        $this->assertSame(['theme' => 'dark', 'list' => [1, 'a']], ExportScrub::clean(['theme' => 'dark', 'access_token' => 'x', 'list' => [1, 'a'], 'cookie' => 'y']));
    }
}
