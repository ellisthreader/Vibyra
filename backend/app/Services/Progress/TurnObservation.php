<?php
namespace App\Services\Progress;
use Illuminate\Support\Facades\DB;

/** Runtime facts only. Never infer success by reading the assistant's prose. */
final class TurnObservation
{
    public function read(object $turn): array
    {
        $tools = DB::table('vibes_tools')->where('turn_id', $turn->id)->orderBy('id')->get();
        $pending = $tools->where('action_state', 'pending')->pluck('id')->all();
        $unknown = $tools->where('action_state', 'unknown')->pluck('id')->all();
        $phase = match (true) {
            $unknown !== [] => 'outcome_unknown',
            $turn->status === 'cancelled' => 'stopped',
            $turn->status === 'failed' => 'failed',
            $turn->finish_reason === 'budget_limit' => 'budget_limit',
            $turn->finish_reason === 'step_limit' => 'step_limit',
            $turn->status === 'completed' => 'reply_ready',
            $pending !== [] => 'approval_pending',
            $turn->status === 'reconciling' => 'reconciling',
            $turn->status === 'waiting' => 'tool_waiting',
            $turn->status === 'queued' => 'queued',
            default => 'working',
        };
        $chat = DB::table('vibes_chats')->where('id', $turn->chat_id)->first();
        return ['phase' => $phase, 'chatId' => $turn->chat_id, 'agentId' => $chat->agent_id ?? null,
            'turnId' => $turn->id, 'step' => (int) $turn->step_count, 'finishReason' => $turn->finish_reason,
            'pending' => $pending, 'unknown' => $unknown,
            'toolStates' => $tools->map(fn ($t) => [$t->id, $t->action_state, $t->result !== null])->all()];
    }
}
