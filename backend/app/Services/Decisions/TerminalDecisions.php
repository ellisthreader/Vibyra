<?php
namespace App\Services\Decisions;

use Illuminate\Support\Facades\{Crypt, DB};

/** One explicit routing request, never inference, a wallet charge, or a tool grant. */
final class TerminalDecisions
{
    public function choose(int $user, array $data): array
    {
        abort_unless(config('intelligence.jev_mode') === 'active' && config('intelligence.terminal_auto'), 503,
            'Vibyra Auto is not available yet. Choose a model to continue.');
        $fingerprint = hash('sha256', json_encode($data));
        $old = DB::table('ai_decisions')->where('id', $data['id'])->first();
        if ($old) return $this->prior($old, $user, $fingerprint);
        $models = app(TerminalChoices::class)->candidates($user, $data);
        try { app(ProviderKeyPolicy::class)->assertSafe(); }
        catch (\RuntimeException) { abort(503, 'Vibyra Auto is temporarily unavailable. Choose a model to continue.'); }
        $inserted = DB::table('ai_decisions')->insertOrIgnore(['id' => $data['id'], 'user_id' => $user,
            'purpose' => 'terminal', 'fingerprint' => $fingerprint, 'state' => 'pending',
            'input' => Crypt::encryptString(json_encode(['consent' => true])),
            'deadline' => now()->addSeconds(8), 'created_at' => now(), 'updated_at' => now()]);
        if (!$inserted) return $this->prior(DB::table('ai_decisions')->where('id', $data['id'])->first(), $user, $fingerprint);
        $guard = app(SpendGuard::class);
        if (!$guard->claim($data['id'])) {
            $this->failed($data['id']);
            abort(429, 'Auto is busy. Try again shortly or choose a model.');
        }
        $actual = null; $unpriced = false;
        try {
            abort_unless(config('intelligence.jev_mode') === 'active' && config('intelligence.terminal_auto'), 503);
            $result = app(JevClient::class)->decide(['task' => $data['text']], app(TerminalChoices::class)->questions($models));
            $actual = (int) ceil($result['cost'] * 1000000);
            $selection = app(TerminalChoices::class)->selection($models, $result);
            DB::table('ai_decisions')->where('id', $data['id'])->update(['state' => 'ready', 'input' => null,
                'result' => Crypt::encryptString(json_encode($selection)), 'model' => $result['model'],
                'usage_micro_usd' => $actual, 'updated_at' => now()]);
            return $selection;
        } catch (DecisionUnavailable $e) {
            $actual = $e->usageMicroUsd; $unpriced = $actual === null;
            $this->failed($data['id']);
            abort(503, 'Auto could not choose a model. Your prompt is safe; try again or choose manually.');
        } catch (\Throwable $e) {
            $this->failed($data['id']); throw $e;
        } finally { $guard->release($data['id'], $actual, $unpriced); }
    }

    private function prior(object $row, int $user, string $fingerprint): array
    {
        abort_unless($row->user_id == $user && $row->purpose === 'terminal' && hash_equals($row->fingerprint, $fingerprint), 409, 'Auto request changed. Try again.');
        abort_unless($row->state === 'ready' && now()->lt($row->created_at ? \Illuminate\Support\Carbon::parse($row->created_at)->addMinutes(10) : now()), 409,
            'Auto has not completed this request. Try again or choose a model.');
        return json_decode(Crypt::decryptString($row->result), true);
    }
    private function failed(string $id): void
    {
        DB::table('ai_decisions')->where('id', $id)->update(['state' => 'fallback', 'input' => null, 'reason' => 'unavailable', 'updated_at' => now()]);
    }
}
