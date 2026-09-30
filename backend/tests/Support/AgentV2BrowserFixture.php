<?php

namespace Tests\Support;

use Illuminate\Support\Facades\DB;

/** A teammate browser grant plus the leased runner's browser endpoints (fixtures, no real browser). */
trait AgentV2BrowserFixture
{
    protected function bootBrowser(bool $capable = true, array $origins = ['https://shop.example.com']): ?string
    {
        config(['agents_v2_browser.enabled' => true]);
        $this->runtime = $this->postJson('/api/agents/v2/runtimes', ['hostId' => $this->hostId, 'provider' => 'claude',
            'accountRef' => 'default', 'model' => 'claude-sonnet', 'capabilities' => ['controlledTools' => true,
                'browserTools' => $capable]])->assertCreated()->json('runtime');
        return $origins === [] ? null : $this->browserSites($origins)->assertOk()->json('browser.connectionId');
    }

    protected function browserSites(array $origins)
    {
        return $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser', ['origins' => $origins]);
    }

    protected function browserPath(array $claimed, string $suffix = ''): string
    {
        return $this->runnerPath('/runs/'.$claimed['id'].'/browser'.$suffix);
    }

    protected function browserClaim(array $claimed, array $action)
    {
        $fingerprint = $action['fingerprint'] ?? DB::table('agent_tool_actions')->where('id', $action['id'])->value('fingerprint');
        return $this->postJson($this->browserPath($claimed, '/'.$action['id'].'/claim'),
            ['generation' => $claimed['generation'], 'fingerprint' => $fingerprint], $this->runnerHeaders());
    }

    protected function browserReceipt(array $claimed, string $actionId, array $result)
    {
        return $this->postJson($this->browserPath($claimed, '/'.$actionId.'/receipt'),
            ['generation' => $claimed['generation'], 'result' => $result], $this->runnerHeaders());
    }

    /** Claim then answer one browser action, as the Rust runner does. */
    protected function browserRun(array $claimed, array $action, array $result)
    {
        $this->browserClaim($claimed, $action)->assertOk()->assertJsonPath('action.state', 'dispatching');
        return $this->browserReceipt($claimed, $action['id'], $result);
    }

    /** What the Mac reports for a page with one form (the snapshot shape of agent_v2_browser). */
    protected function page(string $fp, string $to = 'someone@example.com', string $password = '[hidden]'): array
    {
        return ['url' => 'https://shop.example.com/contact', 'title' => 'Contact', 'pageFingerprint' => $fp,
            'elements' => [['ref' => 'e1', 'role' => 'textbox', 'name' => 'To', 'value' => $to],
                ['ref' => 'e2', 'role' => 'textbox', 'name' => 'Password', 'type' => 'password', 'value' => $password]],
            'forms' => [['action' => 'https://shop.example.com/send', 'method' => 'post',
                'fields' => [['ref' => 'e1', 'name' => 'to', 'label' => 'To', 'type' => 'email', 'value' => $to],
                    ['ref' => 'e2', 'name' => 'pw', 'label' => 'Password', 'type' => 'password', 'value' => $password]],
                'submits' => [['ref' => 'e3', 'label' => 'Send']]]]];
    }

    protected function toolList(string $runId): array
    {
        $tools = array_column($this->getJson('/api/agents/v2/runs/'.$runId.'/tools')->assertOk()->json('manifest.tools'), 'tool');
        sort($tools);
        return $tools;
    }
}
