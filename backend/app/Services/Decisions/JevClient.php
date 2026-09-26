<?php
namespace App\Services\Decisions;
use Illuminate\Support\Facades\{Cache, Http};
final class JevClient
{
    /** Dedicated Decisions API; no chat-completion fallback and no automatic retries. */
    public function decide(array $state, array $questions): array
    {
        if (config('intelligence.jev_url') !== 'https://openrouter.ai/api/alpha/decisions') throw new \RuntimeException('invalid_provider');
        if (!config('intelligence.jev_key') || Cache::has('jev:circuit')) throw new \RuntimeException('provider_unavailable');
        if (strlen(json_encode($state)) > 12000) throw new \RuntimeException('input_limit');
        $usage = null;
        try {
            $r = Http::withToken(config('intelligence.jev_key'))->acceptJson()->withoutRedirecting()->connectTimeout(1)->timeout(1)
                ->post(config('intelligence.jev_url'), ['model' => config('intelligence.jev_model'), 'state' => $state, 'questions' => $questions]);
            // Billing survives rejected answers, unexpected models and unsuccessful status codes.
            $cost = $r->json('usage.cost');
            if (is_numeric($cost) && is_finite((float) $cost) && $cost >= 0 && $cost < PHP_INT_MAX / 1000000) {
                $usage = (int) ceil((float) $cost * 1000000);
            }
            if (!$r->successful()) throw new \RuntimeException('provider_error');
            $body = $r->json();
            if (!is_array($body) || ($body['model'] ?? null) !== config('intelligence.jev_served_model')) throw new \RuntimeException('model_version');
            $answers = [];
            foreach ($questions as $id => $question) {
                $a = $body['answers'][$id] ?? null;
                if (!is_array($a) || ($a['type'] ?? null) !== 'choice' || !isset($question['criteria'][$a['choice'] ?? ''])) throw new \RuntimeException('invalid_answer');
                $confidence = $a['confidence'] ?? null; $probabilities = $a['probabilities'] ?? null;
                if (!is_numeric($confidence) || !is_finite((float) $confidence) || $confidence < 0 || $confidence > 1 || !is_array($probabilities)) throw new \RuntimeException('invalid_confidence');
                if (array_diff(array_keys($probabilities), array_keys($question['criteria'])) || array_diff(array_keys($question['criteria']), array_keys($probabilities))) throw new \RuntimeException('invalid_probabilities');
                foreach ($probabilities as $p) if (!is_numeric($p) || !is_finite((float) $p) || $p < 0 || $p > 1) throw new \RuntimeException('invalid_probability');
                if (abs(array_sum($probabilities) - 1) > 0.02) throw new \RuntimeException('invalid_distribution');
                $answers[$id] = ['choice' => $a['choice'], 'confidence' => (float) $confidence, 'probabilities' => $probabilities];
            }
            $cost = $body['usage']['cost'] ?? null;
            if ($usage === null) throw new \RuntimeException('usage_unknown');
            return ['answers' => $answers, 'model' => $body['model'], 'cost' => (float) $cost];
        } catch (\Throwable $e) {
            Cache::put('jev:circuit', true, 30);
            throw new DecisionUnavailable($usage);
        }
    }
}
