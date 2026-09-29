<?php

namespace App\Services\Decisions;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Crypt, DB, Log};

/** An explicit routing request, never inference, a wallet charge or a tool grant. */
final class TerminalDecisions
{
    public function choose(int $user, array $data): array
    {
        $this->requireEnabled();
        $fingerprint = hash('sha256', json_encode($data));
        $old = DB::table('ai_decisions')->where('id', $data['id'])->first();
        if ($old) return $this->prior($old, $user, $fingerprint);

        $choices = app(TerminalChoices::class);
        $models = $choices->candidates($user, $data);
        try {
            app(ProviderKeyPolicy::class)->assertSafe(interactive: true);
        } catch (\RuntimeException) {
            abort(503, 'Vibyra Auto is temporarily unavailable. Choose a model to continue.');
        }
        $inserted = DB::table('ai_decisions')->insertOrIgnore([
            'id' => $data['id'], 'user_id' => $user, 'purpose' => 'terminal',
            'fingerprint' => $fingerprint, 'state' => 'pending',
            'input' => Crypt::encryptString(json_encode(['consent' => true])),
            'deadline' => now()->addSeconds(20), 'created_at' => now(), 'updated_at' => now(),
        ]);
        if (!$inserted) {
            return $this->prior(DB::table('ai_decisions')->where('id', $data['id'])->first(), $user, $fingerprint);
        }
        $guard = app(SpendGuard::class);
        if (!$guard->claim($data['id'])) {
            $this->failed($data['id'], 'admission_denied');
            abort(429, 'Auto is busy. Try again shortly or choose a model.');
        }

        $actual = null;
        $unpriced = false;
        try {
            $this->requireEnabled();
            $result = app(JevClient::class)->decide(
                ['task' => $data['text']], $choices->questions($models), JevClient::TERMINAL_TIMEOUT,
            );
            $actual = JevResponse::usage($result['cost']);
            $selection = $choices->selection($models, $result);
            DB::table('ai_decisions')->where('id', $data['id'])->update([
                'state' => 'ready', 'input' => null,
                'result' => Crypt::encryptString(json_encode($selection)), 'model' => $result['model'],
                'usage_micro_usd' => $actual, 'updated_at' => now(),
            ]);

            return $selection;
        } catch (DecisionUnavailable $error) {
            $actual = $error->usageMicroUsd;
            $unpriced = $actual === null;
            $this->failed($data['id'], $error->reason, $actual);
            Log::warning('Terminal Auto decision failed', [
                'decision_id' => $data['id'], 'reason' => $error->reason,
                'provider_status' => $error->httpStatus, 'usage_micro_usd' => $actual,
            ]);
            abort(503, 'Auto is temporarily unavailable. Your message is saved; choose a model to continue.');
        } catch (\RuntimeException $error) {
            $this->failed($data['id'], 'unavailable', $actual);
            // Local preflight failures have no billable request and must not become HTTP 500s.
            abort(503, 'Auto is temporarily unavailable. Your message is saved; try again shortly.');
        } catch (\Throwable $error) {
            $this->failed($data['id'], 'unavailable', $actual);
            throw $error;
        } finally {
            $guard->release($data['id'], $actual, $unpriced);
        }
    }

    private function requireEnabled(): void
    {
        abort_unless(config('intelligence.jev_mode') === 'active' && config('intelligence.terminal_auto'), 503,
            'Vibyra Auto is not available yet. Choose a model to continue.');
    }

    private function prior(object $row, int $user, string $fingerprint): array
    {
        abort_unless($row->user_id == $user && $row->purpose === 'terminal' && hash_equals($row->fingerprint, $fingerprint),
            409, 'Auto request changed. Try again.');
        abort_unless($row->state === 'ready' && $row->created_at && now()->lt(Carbon::parse($row->created_at)->addMinutes(10)),
            409, 'Auto has not completed this request. Try again or choose a model.');

        return json_decode(Crypt::decryptString($row->result), true);
    }

    private function failed(string $id, string $reason, ?int $usage = null): void
    {
        DB::table('ai_decisions')->where('id', $id)->update([
            'state' => 'fallback', 'input' => null, 'reason' => $reason,
            'usage_micro_usd' => $usage, 'updated_at' => now(),
        ]);
    }
}
