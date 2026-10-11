<?php
namespace App\Services\AgentBrowserWorkflows;
use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\Canonical;
/** Only exact, completed browser receipts advance the tested procedure. */
final class Progress
{
    public static function state(Run $run, array $context): array
    {
        $index = 0; $resolved = null; $opened = false;
        $ids = \App\Models\AgentV2\RunEvent::query()->where('run_id', $run->id)->where('source', 'server')->where('type', 'tool.requested')->orderBy('seq')->get()->map(fn ($e) => $e->payload['actionId'] ?? '')->all();
        $rows = ToolAction::query()->where('run_id', $run->id)->get()->keyBy('id');
        $actions = array_filter(array_map(fn ($id) => $rows[$id] ?? null, $ids));
        foreach ($actions as $a) {
            if ($a->state !== 'completed') continue;
            $step = $context['steps'][$index] ?? null;
            if (!$step) break;
            if ($a->tool === 'browser_open') { $opened = true; $resolved = null; continue; }
            if ($a->tool === 'browser_resolve' && Canonical::hash($a->arguments) === Canonical::hash($step['target'])) {
                $resolved = $a->result; continue;
            }
            if ($resolved && $a->tool === 'browser_'.$step['operation'] && self::matches($a->arguments, $step, $resolved, $context['inputs'])) {
                $index++; $resolved = null;
            }
        }
        return ['index' => $index, 'resolved' => $resolved, 'opened' => $opened, 'complete' => $index === count($context['steps'])];
    }
    public static function matches(array $args, array $step, array $resolved, array $inputs): bool
    {
        if (!is_string($resolved['resolvedRef'] ?? null) || ($args['ref'] ?? null) !== $resolved['resolvedRef']) return false;
        if ($step['operation'] === 'type' && ($args['text'] ?? null) !== ($inputs[$step['parameter']] ?? null)) return false;
        return $step['operation'] !== 'submit' || ($args['pageFingerprint'] ?? null) === ($resolved['pageFingerprint'] ?? null);
    }
    public static function permits(Run $run, array $call, array $context): bool
    {
        $state = self::state($run, $context); $step = $context['steps'][$state['index']] ?? null;
        if (!$step) return false;
        $tool = $call['tool'] ?? ''; $args = $call['arguments'] ?? [];
        if ($tool === 'browser_open') return $state['index'] === 0 && !$state['opened']
            && $args === ['url' => $step['target']['origin'].$step['target']['path']];
        if ($tool === 'browser_takeover_request') return $state['opened'];
        if ($tool === 'browser_resolve') return $state['opened'] && Canonical::hash($args) === Canonical::hash($step['target']);
        return $state['resolved'] && $tool === 'browser_'.$step['operation']
            && self::matches($args, $step, $state['resolved'], $context['inputs']);
    }
}
