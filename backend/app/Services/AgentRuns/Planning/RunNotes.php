<?php

namespace App\Services\AgentRuns\Planning;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Tools\{Manifest, Relevance};

/**
 * The plan card's gaps, told to the model as well: a missing, ungranted or expired
 * account is otherwise just an absent tool, and the model answers "I can't access
 * email" instead of naming the one fix. Names only: nothing is granted here.
 */
final class RunNotes
{
    public function __construct(private readonly Manifest $manifest, private readonly Relevance $relevance,
        private readonly PlanGaps $gaps) {}

    /** @return array{gaps: array, text: string} */
    public function for(Run $run, ?object $agent): array
    {
        if (!$agent) return ['gaps' => [], 'text' => ''];
        try {
            $selection = $this->manifest->selection($run);
            $services = array_map(fn (array $t) => ['provider' => $t['provider']], $selection['tools']);
            $gaps = $this->gaps->find((int) $run->user_id, $agent, $run, $this->relevance->mentionedProviders($run),
                $services, $selection['dropped']);
        } catch (\Throwable $e) {
            report($e); // Notes are advice; a claim must never fail for them.
            return ['gaps' => [], 'text' => ''];
        }
        $lines = array_map(fn (array $g) => '- '.$g['message'].$this->fix($g['fix']['message'] ?? null), $gaps);
        $rule = 'If the person asks for a service you have no tools for, say which service is missing and how they can connect '
            .'or allow it; never just say you cannot do it.';
        return ['gaps' => $gaps, 'text' => ($lines ? "Connection notes for this task:\n".implode("\n", $lines)."\n" : '').$rule];
    }

    /** The brief the runner shows the model, with the notes after it (installed Macs render only the brief). */
    public static function brief(?string $brief, string $text): ?string
    {
        if ($text === '') return $brief;
        return trim((string) $brief) === '' ? $text : rtrim((string) $brief)."\n\n".$text;
    }

    private function fix(?string $message): string
    {
        if (!$message) return '';
        // "Connections" on the Mac is the teammate's Access tab on the iPhone.
        return ' Fix: '.(str_contains($message, 'in Connections') ? substr($message, 0, -1).' (the teammate\'s Access tab on iPhone).' : $message);
    }
}
