<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;
class AgentBrowserAccessCasTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;
    public function test_first_create_tombstone_stale_edits_and_uncertain_retry_are_fenced(): void
    {
        $this->bootV2(); $this->bootBrowser(true, []);
        $path = '/api/agents/v2/agents/'.$this->agent['id'].'/browser';
        $first = ['origins' => ['https://shop.example.com'], ...$this->browserExpected()];
        $a = $this->putJson($path, $first)->assertOk()->assertJsonPath('revision', 1)->json('browser');
        $this->putJson($path, $first)->assertOk()->assertJsonPath('revision', 1);
        $old = $this->browserExpected();
        $this->browserSites(['https://other.example.com'])->assertOk()->assertJsonPath('revision', 2);
        $this->deleteJson($path, $old)->assertStatus(409);
        $remove = $this->browserExpected(); $this->deleteJson($path, $remove)->assertOk()->assertJsonPath('revision', 3);
        $this->deleteJson($path, $remove)->assertOk()->assertJsonPath('revision', 3);
        $this->putJson($path, $first)->assertStatus(409);
        $this->getJson($path)->assertOk()->assertJsonPath('browser', null)->assertJsonPath('revision', 3);
        $this->putJson($path, ['origins' => ['https://shop.example.com']])->assertStatus(422);
        $b = $this->browserSites(['https://shop.example.com'])->assertOk()->assertJsonPath('revision', 4)->json('browser');
        $this->assertNotSame($a['connectionId'], $b['connectionId']);
    }
}
