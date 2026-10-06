<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\DB;

/** Session identity and budget; inference uses the existing versioned wallet ledger. */
final class FundedTerminals
{
    public function authorize(int $user): void
    {
        abort_unless(config('vibes.funded_terminals_enabled') && config('vibes.enabled'), 503, 'Token terminals are not available yet. Your AI accounts still work.');
        abort_unless(app(Plans::class)->for(app(Wallet::class)->planFor($user))['fundedTerminals'], 403, 'An active Pro membership is needed for token terminals.');
    }

    public function create(int $user, array $data): object
    {
        return DB::transaction(function () use ($user, $data) {
            $wallet = app(Wallet::class)->lock($user);
            $this->authorize($user);
            abort_unless($wallet->consented_at, 403, 'Allow AI processing before launching.');
            $prior = DB::table('vibes_chats')->where('id', $data['id'])->first();
            if ($prior) {
                abort_unless($prior->user_id == $user && $prior->terminal_model === $data['model'] && ($prior->terminal_effort ?? null) === ($data['effort'] ?? null) &&
                    $prior->host_id === $data['hostId'] && $prior->project_id === $data['projectId'] &&
                    $prior->binding === $data['binding'] && (bool) $prior->terminal_tools === $data['tools'] && $prior->terminal_budget_micro == $data['budget'] * 10000,
                    409, 'This launch was already used for a different session.');
                return $prior;
            }
            abort_if(DB::table('vibes_chats')->where('user_id', $user)->count() >= 500, 422, 'Session limit reached.');
            $model = app(TerminalCatalog::class)->resolve($data['model']);
            abort_unless(TerminalCatalog::choosable($model['efforts']), 422, 'Choose a model with effort levels.');
            abort_unless(TerminalCatalog::listed($model['id']), 422, 'Choose a model from the list.');
            $effort = $data['effort'] ?? null;
            $catalog = app(Catalog::class)->resolve($model['id'], app(Wallet::class)->planFor($user));
            abort_if($effort !== null && !in_array($effort, $catalog['efforts'], true), 422, 'Choose a supported effort for this model.');
            abort_unless($model['tools'] === $data['tools'], 409, 'This model’s capabilities changed. Refresh the model list before launching.');
            app(\App\Services\Membership\Projects::class)->activate($user, $data['hostId'], $data['projectId']);
            DB::table('vibes_chats')->insert(['id' => $data['id'], 'user_id' => $user, 'title' => $data['title'],
                'host_id' => $data['hostId'], 'project_id' => $data['projectId'], 'binding' => $data['binding'],
                'terminal_model' => $model['id'], 'terminal_effort' => $effort, 'terminal_model_name' => mb_substr($model['name'], 0, 200), 'terminal_tools' => $model['tools'],
                'terminal_budget_micro' => $data['budget'] * 10000, 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('vibes_chats')->where('id', $data['id'])->first();
        });
    }

    public function guard(int $user, object $chat, string $model, int $reservationMicro = 0): void
    {
        if (! ($chat->terminal_model ?? null)) return;
        $this->authorize($user);
        abort_if($chat->terminal_closed_at, 409, 'This terminal is closed. Start a new terminal to continue.');
        abort_unless($chat->terminal_model === $model, 409, 'This terminal keeps its chosen model. Launch a new terminal to change it.');
        abort_if($reservationMicro + $this->spent($chat->id) > $chat->terminal_budget_micro, 402,
            'This reply exceeds the terminal’s remaining token limit. Start a new terminal with a larger limit.');
    }

    public function remaining(object $chat): int
    {
        return max(0, $chat->terminal_budget_micro - $this->spent($chat->id));
    }

    private function spent(string $chat): int
    {
        return (int) DB::table('vibes_turns')->where('chat_id', $chat)->get(['charged', 'reserved', 'settled_at', 'unit_scale'])
            ->sum(fn ($t) => ($t->settled_at ? $t->charged : $t->reserved) * intdiv(10000, $t->unit_scale ?? 1));
    }
}
