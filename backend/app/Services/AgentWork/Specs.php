<?php
namespace App\Services\AgentWork;

use App\Services\AgentRuns\Tools\Providers\Schema;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Validator;

/** Pure bounded proposal validation; no proposal ever creates execution authority here. */
final class Specs
{
    public static function goal(array $spec): array
    {
        Schema::only($spec, ['agentId', 'runtimeId', 'title', 'expiresAt', 'milestones']);
        $base = self::common($spec);
        $steps = $spec['milestones'] ?? null;
        abort_unless(is_array($steps) && array_is_list($steps) && count($steps) >= 1 && count($steps) <= 12, 422, 'Use 1–12 milestones.');
        $seen = []; $normalized = [];
        foreach ($steps as $step) {
            abort_unless(is_array($step), 422, 'Use structured milestones.');
            Schema::only($step, ['key', 'title', 'prompt', 'successCriteria', 'dependsOn']);
            $s = Validator::make($step, ['key' => ['required', 'string', 'regex:/^[a-zA-Z0-9_-]{1,40}$/D'],
                'title' => 'required|string|max:120', 'prompt' => 'required|string|max:8000',
                'successCriteria' => 'required|string|max:1000', 'dependsOn' => 'sometimes|array|max:11',
                'dependsOn.*' => 'required|string|max:40|distinct'])->validate();
            abort_if(in_array($s['key'], $seen, true), 422, 'Milestone keys must be unique.');
            $s['dependsOn'] = array_values($s['dependsOn'] ?? []);
            abort_if(array_diff($s['dependsOn'], $seen) !== [], 422, 'Dependencies must name earlier milestones.');
            foreach (['title', 'prompt', 'successCriteria'] as $field) abort_if(trim($s[$field]) === '', 422, 'Milestone text must not be empty.');
            $seen[] = $s['key']; $normalized[] = $s;
        }
        return [...$base, 'milestones' => $normalized];
    }

    public static function followup(array $spec): array
    {
        Schema::only($spec, ['agentId', 'runtimeId', 'title', 'expiresAt', 'prompt', 'condition']);
        $base = self::common($spec);
        $prompt = Schema::text($spec['prompt'] ?? null, 8000, 'Describe the follow-up.');
        $condition = $spec['condition'] ?? null;
        abort_unless(is_array($condition), 422, 'Choose a follow-up condition.');
        Schema::only($condition, ['kind', 'at', 'triggerId', 'triggerRevision', 'subject']);
        $kind = $condition['kind'] ?? null;
        abort_unless(in_array($kind, ['time', 'event', 'absence'], true), 422, 'Choose time, event or absence.');
        $out = ['kind' => $kind];
        if ($kind !== 'event') {
            $out['at'] = self::date($condition['at'] ?? null);
            abort_if(CarbonImmutable::parse($out['at'])->gte(CarbonImmutable::parse($base['expiresAt'])), 422, 'The follow-up must be due before expiry.');
        } else abort_if(isset($condition['at']), 422, 'An event follow-up uses its expiry, not a time condition.');
        if ($kind !== 'time') {
            $data = Validator::make($condition, ['triggerId' => 'required|uuid', 'triggerRevision' => 'required|integer|min:1',
                'subject' => 'required|string|max:191'])->validate();
            $data['triggerRevision'] = (int) $data['triggerRevision'];
            $out += $data;
        } else abort_if(isset($condition['triggerId']) || isset($condition['triggerRevision']) || isset($condition['subject']), 422, 'A time follow-up has no event source.');
        return [...$base, 'prompt' => $prompt, 'condition' => $out];
    }

    private static function common(array $spec): array
    {
        $data = Validator::make($spec, ['agentId' => 'required|uuid', 'runtimeId' => 'required|uuid', 'title' => 'required|string|max:120'])->validate();
        abort_if(trim($data['title']) === '', 422, 'Add a title.');
        return [...$data, 'expiresAt' => self::date($spec['expiresAt'] ?? null)];
    }

    private static function date(mixed $value): string
    {
        $pattern = '/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/D';
        abort_unless(is_string($value) && preg_match($pattern, $value, $m), 422, 'Use a complete ISO time including seconds and timezone.');
        abort_unless(checkdate((int) $m[2], (int) $m[3], (int) $m[1]) && (int) $m[4] <= 23 && (int) $m[5] <= 59
            && (int) $m[6] <= 59 && (int) ($m[9] ?? 0) <= 14 && (int) ($m[10] ?? 0) <= 59
            && ((int) ($m[9] ?? 0) < 14 || (int) ($m[10] ?? 0) === 0), 422, 'Use a real calendar date and timezone.');
        $time = CarbonImmutable::parse($value)->utc();
        abort_unless($time->lte(now()->addDays(90)), 422, 'Choose a time within 90 days.');
        return $time->toIso8601String();
    }
}
