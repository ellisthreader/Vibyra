<?php
namespace App\Jobs;
use App\Services\Decisions\{JevClient, Questions, SpendGuard, ProviderKeyPolicy, DecisionUnavailable, DecisionEligibility};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{Crypt, DB};
final class ClassifyDecision implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 5;
    public function __construct(public string $decisionId) { $this->onQueue('decisions'); }
    public function handle(JevClient $client): void
    {
        if (!in_array(config('intelligence.jev_mode'), ['shadow','active'])) return;
        $d = DB::table('ai_decisions')->where('id', $this->decisionId)->first();
        if (!$d || $d->state !== 'pending') return;
        try { $input = json_decode(Crypt::decryptString($d->input), true, 512, JSON_THROW_ON_ERROR); }
        catch (\Throwable) { $input = []; }
        if (!is_array($input) || !DecisionEligibility::allows($d, $input)) {
            DB::table('ai_decisions')->where('id', $this->decisionId)->where('state', 'pending')
                ->update(['state' => 'fallback', 'reason' => 'feature_disabled', 'updated_at' => now()]);
            return;
        }
        if ($d->purpose === 'routing') {
            try { app(\App\Services\Decisions\Preparations::class)->freshQuote($d->user_id, $input['quote']); }
            catch (\Throwable) {
                DB::table('ai_decisions')->where('id', $this->decisionId)->where('state', 'pending')
                    ->update(['state' => 'fallback', 'reason' => 'context_changed', 'updated_at' => now()]);
                return;
            }
        }
        $guard = app(SpendGuard::class);
        try { $claimed = $guard->claim($this->decisionId); } catch (\Throwable) { return; }
        if (!$claimed) {
            DB::table('ai_decisions')->where('id', $this->decisionId)->where('state', 'pending')
                ->update(['state' => 'fallback', 'reason' => 'admission_denied', 'updated_at' => now()]);
            return;
        }
        $d = DB::table('ai_decisions')->where('id', $this->decisionId)->first();
        $pref = DB::table('notification_preferences')->where('user_id', $d->user_id)->first();
        if (!$pref?->smart) { $guard->release($this->decisionId); $this->finish('fallback', null, 'consent'); return; }
        $actual = null; $unpriced = false;
        try {
            app(ProviderKeyPolicy::class)->assertSafe();
            if (now()->gte($d->deadline)) throw new \RuntimeException('deadline');
            // Metadata verification may yield while consent or the deployment switch changes.
            if (!DecisionEligibility::allows($d, $input)) {
                $this->finish('fallback', null, 'consent'); return;
            }
            $result = $client->decide($input['state'], $d->purpose === 'progress' ? Questions::progress() : Questions::routing());
            $actual = (int) ceil($result['cost'] * 1000000);
            DB::table('ai_decisions')->where('id', $this->decisionId)->update(['usage_micro_usd' => $actual]);
            $this->finish('classified', $result);
        } catch (DecisionUnavailable $e) {
            $actual = $e->usageMicroUsd; $unpriced = $actual === null;
            if ($actual !== null) DB::table('ai_decisions')->where('id', $this->decisionId)->update(['usage_micro_usd' => $actual]);
            $this->finish('fallback', null, 'unavailable');
        } catch (\Throwable) { $this->finish('fallback', null, 'unavailable'); }
        finally { $guard->release($this->decisionId, $actual, $unpriced); }
    }
    private function finish(string $state, ?array $result, ?string $reason = null): void
    {
        DB::table('ai_decisions')->where('id', $this->decisionId)->where('state', 'classifying')
            ->where('deadline', '>', now())->update(['state' => $state, 'result' => $result ? Crypt::encryptString(json_encode($result)) : null,
                'reason' => $reason, 'model' => $result['model'] ?? null, 'updated_at' => now()]);
    }
}
