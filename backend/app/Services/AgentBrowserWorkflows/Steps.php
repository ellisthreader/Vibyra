<?php
namespace App\Services\AgentBrowserWorkflows;
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentRuns\Browser\BrowserOrigins;
/** Semantic targets only: no scripts, selectors, coordinates, captured values or login fields. */
final class Steps
{
    public static function clean(array $steps, array $origins): array
    {
        if (!$steps || count($steps) > 16) self::invalid();
        $out = [];
        foreach ($steps as $step) {
            if (!is_array($step) || array_diff(array_keys($step), ['operation', 'target', 'parameter'])) self::invalid();
            $op = $step['operation'] ?? null; $t = $step['target'] ?? null;
            if (!in_array($op, ['click', 'type', 'submit'], true) || !is_array($t)
                || array_diff(array_keys($t), ['origin', 'path', 'role', 'name', 'inputType', 'href'])) self::invalid();
            $t = \App\Services\AgentBrowser\Semantic::validate($t);
            if (!in_array($t['origin'], $origins, true) || \App\Services\AgentRuns\Guard\SecretGuard::kindsIn($t) !== []) self::invalid();
            if ($op === 'type' && (!is_string($step['parameter'] ?? null) || !preg_match('/^input[1-9][0-9]?$/D', $step['parameter']))) self::invalid();
            if ($op !== 'type' && isset($step['parameter'])) self::invalid();
            $out[] = ['operation' => $op, 'target' => $t, ...($op === 'type' ? ['parameter' => $step['parameter']] : [])];
        }
        return $out;
    }
    public static function parameters(array $steps): array { return array_values(array_unique(array_column($steps, 'parameter'))); }
    public static function hash(string $name, array $steps): string { return Canonical::hash([$name, $steps]); }
    public static function instructions(array $steps): string
    {
        return "Follow this reviewed browser procedure. Ask the person for fresh, non-secret values for its named parameters. Never collect passwords or codes. Open the first exact origin and path. For each step call browser_resolve with its exact semantic target, then use its resolvedRef for the named operation. Stop if a target is missing or ambiguous. Form submission always needs the existing exact approval; this skill grants no access. Never substitute a different target.\n".Canonical::json($steps);
    }
    private static function invalid(): never { ApiError::throw(422, 'invalid_browser_steps', 'Use 1–16 semantic steps on granted sites, without secret fields, captured values or token URLs.'); }
}
