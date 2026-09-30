<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Jobs\RunVibesTurn;
use App\Services\CloudWorkspaces\{Runtime, Tools, Workspaces};
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

class CloudAiTest extends CloudTestCase
{
    public function test_ai_tools_run_without_phone_results_and_share_the_runtime_wallet(): void
    {
        $id = $this->imported(); [$access, $token] = $this->ready($id);
        $w = app(Workspaces::class)->owned($this->user->id, $id);
        $q = $this->withHeader('X-Vibyra-Cloud-Access', $access)->postJson('/api/vibes/quote', [
            'chatId' => $w->chat_id, 'text' => 'Read app.txt', 'model' => 'test/model'])->assertOk()->json();
        $this->assertLessThanOrEqual(50000, (int) $q['maximumUnits']);
        $turn = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $turn, 'quote' => $q['quote']])->assertStatus(202);
        $this->assertSame(53000, (int) app(Wallet::class)->payload($this->user->id)['heldUnits']);
        Http::fake([config('services.openrouter.url') => Http::sequence()->push(['id' => 'gen-one', 'usage' => ['cost' => .0001],
            'choices' => [['message' => ['role' => 'assistant', 'content' => null, 'tool_calls' => [['id' => 'call-one', 'type' => 'function',
                'function' => ['name' => 'read_file', 'arguments' => json_encode(['path' => 'app.txt'])]]]]]]])
            ->push(['id' => 'gen-two', 'usage' => ['cost' => .0001], 'choices' => [['message' => ['content' => 'The file says hello.']]]])]);
        (new RunVibesTurn($turn))->handle(app(Turns::class));
        $a = DB::table('cloud_actions')->where('workspace_id', $id)->first(); $this->assertSame('queued', $a->state);
        $tool = DB::table('vibes_tools')->where('id', $a->tool_id)->first();
        $this->postJson('/api/vibes/tools/'.$tool->id.'/result', ['decision' => 'allow', 'result' => ['content' => 'forged']])->assertForbidden();
        $runtime = app(Runtime::class); $authority = $runtime->authenticate($id, $token); $claimed = $runtime->claim($authority); $this->assertSame($a->id, $claimed->id);
        $this->assertNull($runtime->claim($authority));
        $a = $runtime->result($authority, $a->id, ['path' => 'app.txt', 'content' => 'hello', 'sha256' => hash('sha256', 'hello')]);
        app(Tools::class)->complete($a); app(Tools::class)->complete($a);
        (new RunVibesTurn($turn))->handle(app(Turns::class));
        $this->assertSame('completed', DB::table('vibes_turns')->where('id', $turn)->value('status'));
        $this->assertSame(200, DB::table('vibes_turns')->where('id', $turn)->value('charged'));
        $this->assertSame(3000, (int) app(Wallet::class)->payload($this->user->id)['heldUnits']);
        Http::assertSent(fn ($r) => !isset($r['vibyraCloud']) && $r['model'] === 'test/model');
    }
    public function test_queued_ai_cannot_dispatch_after_compute_authority_expires(): void
    {
        $id = $this->imported(); [$access] = $this->ready($id); $w = app(Workspaces::class)->owned($this->user->id, $id);
        $q = $this->withHeader('X-Vibyra-Cloud-Access', $access)->postJson('/api/vibes/quote', ['chatId' => $w->chat_id, 'text' => 'Hello', 'model' => 'test/model'])->assertOk()->json();
        $turn = (string) Str::uuid(); $this->postJson('/api/vibes/turns', ['id' => $turn, 'quote' => $q['quote']])->assertStatus(202);
        $this->travel(31)->seconds(); Http::fake(); (new RunVibesTurn($turn))->handle(app(Turns::class)); Http::assertNothingSent();
        $this->assertSame(0, DB::table('vibes_turns')->where('id', $turn)->value('charged'));
        $this->assertSame(3000, (int) app(Wallet::class)->payload($this->user->id)['heldUnits']);
    }
    public function test_revoked_device_cannot_use_an_old_cloud_capability(): void
    {
        $id = $this->imported(); [$access] = $this->ready($id); $this->device->update(['revoked_at' => now()]);
        $this->withHeader('X-Vibyra-Cloud-Access', $access)->postJson('/api/cloud-workspaces/'.$id.'/actions', [
            'id' => (string) Str::uuid(), 'operation' => 'read_file', 'arguments' => ['path' => 'app.txt']])->assertForbidden();
        $this->postJson('/api/cloud-workspaces/'.$id.'/stop')->assertOk();
    }
}
