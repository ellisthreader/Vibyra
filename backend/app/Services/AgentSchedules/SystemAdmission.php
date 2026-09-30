<?php

namespace App\Services\AgentSchedules;

use App\Models\AgentV2\Run;
use App\Models\User;
use App\Services\AgentRuns\Access;
use App\Services\AgentRuns\Admission;
use App\Services\Membership\PlanLimits;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Admits a run on the person's behalf (schedule occurrence or trigger event) through the
 * one manual-chat Admission: same grants snapshot, same account binding, same broker,
 * no Vibes. The idempotency key is derived from the occurrence/event, so a retry returns
 * the run it already started. Refusals come back as a machine code instead of throwing.
 */
final class SystemAdmission
{
    public function __construct(private readonly Admission $admission, private readonly Access $access) {}

    /** @return array{run: ?Run, code: ?string} */
    public function admit(int $userId, string $agentId, string $key, string $prompt, ?string $runtimeId): array
    {
        if (!$this->access->allows($userId)) return ['run' => null, 'code' => 'agents_v2_unavailable'];
        $user = User::query()->find($userId);
        if (!$user || !app(PlanLimits::class)->allows($user, 'agents')) return ['run' => null, 'code' => 'plan_required'];
        $prompt = mb_substr($prompt, 0, (int) config('agents_v2.max_prompt_chars', 20000));
        try {
            [$run] = $this->admission->admit($userId, ['agentId' => $agentId, 'idempotencyKey' => $key,
                'prompt' => $prompt, 'attachments' => [], 'runtimeId' => $runtimeId]);
            return ['run' => $run, 'code' => null];
        } catch (HttpResponseException $e) {
            $code = $e->getResponse()->getData(true)['code'] ?? null;
            return ['run' => null, 'code' => is_string($code) ? $code : 'admission_refused'];
        }
    }
}
