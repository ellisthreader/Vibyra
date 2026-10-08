<?php

namespace Tests\Support;

use App\Services\AgentRuns\Delegation\Delegation;
use App\Services\Agents\Teammates;
use Illuminate\Support\Str;

/** Part 16 helpers on top of AgentV2Fixture: the flags, a second teammate and the runner's `delegate_task` call. */
trait AgentDepthFixture
{
    protected function depth(array $on = ['delegation', 'secret_guard', 'rules', 'observability']): void
    {
        foreach ($on as $flag) config(['agent_depth.'.$flag => true]);
        config(['platform.activity' => true]);
    }

    /** Another teammate of the same account (its own conversation, its own grants). */
    protected function teammate(string $name, array $grants = []): array
    {
        $agent = app(Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => $name, 'brief' => 'Help.',
            'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        foreach ($grants as $connection => $ops)
            $this->putJson('/api/agents/v2/agents/'.$agent['id'].'/grants/'.$connection, ['operations' => $ops])->assertOk();
        return $agent;
    }

    protected function delegate(array $claimed, string $teammate, string $task, string $callId, ?string $connectionId = null)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/tools'), ['generation' => $claimed['generation'], 'callId' => $callId,
            'tool' => 'delegate_task', 'connectionId' => $connectionId ?? $claimed['id'], 'schemaRevision' => Delegation::schemaRevision(),
            'arguments' => ['teammate' => $teammate, 'task' => $task]], $this->runnerHeaders());
    }

    protected function complete(array $claimed, string $answer)
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => $answer], $this->runnerHeaders());
    }

    protected function failRun(array $claimed, string $reason = 'The model stopped.')
    {
        return $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/fail'), ['generation' => $claimed['generation'], 'code' => 'provider_error',
            'reason' => $reason], $this->runnerHeaders());
    }

    protected function runnerAction(array $claimed, string $actionId)
    {
        return $this->getJson($this->runnerPath('/runs/'.$claimed['id'].'/actions/'.$actionId.'?generation='.$claimed['generation']), $this->runnerHeaders());
    }
}
