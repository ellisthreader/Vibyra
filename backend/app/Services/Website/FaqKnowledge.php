<?php

namespace App\Services\Website;

/**
 * The knowledge the homepage's "Ask Vibyra" answer is allowed to draw on:
 * the curated marketing facts plus the live plan catalogue, so an answer
 * about pricing can never drift from what the pricing section shows.
 */
class FaqKnowledge
{
    public function text(): string
    {
        $path = resource_path('knowledge/website-faq.md');
        $facts = is_file($path) ? (string) file_get_contents($path) : '';

        return rtrim($facts)."\n\n".$this->planCatalogue();
    }

    private function planCatalogue(): string
    {
        $lines = ["## Live plan catalogue (GBP, VAT included)"];
        foreach ((array) config('billing.plans', []) as $key => $plan) {
            $monthly = $this->pounds((int) ($plan['monthly_price_pence'] ?? 0));
            $annual = $this->pounds((int) ($plan['annual_price_pence'] ?? 0));
            $projects = (int) ($plan['max_active_projects'] ?? 0);
            $agents = (int) ($plan['max_concurrent_agents'] ?? 0);
            $lines[] = sprintf(
                '- %s: %s per month or %s per year, %d credits per month, %d active %s, %s.',
                $plan['label'] ?? ucfirst((string) $key),
                $monthly,
                $annual,
                (int) ($plan['monthly_credits'] ?? 0),
                $projects,
                $projects === 1 ? 'project' : 'projects',
                $agents > 0 ? "{$agents} concurrent cloud ".($agents === 1 ? 'agent' : 'agents') : 'free and budget model access only',
            );
        }
        foreach ((array) config('billing.topups', []) as $topup) {
            $lines[] = sprintf(
                '- Top-up: %d credits for %s.',
                (int) ($topup['credits'] ?? 0),
                $this->pounds((int) ($topup['price_pence'] ?? 0)),
            );
        }

        return implode("\n", $lines);
    }

    private function pounds(int $pence): string
    {
        return $pence === 0 ? '£0' : '£'.rtrim(rtrim(number_format($pence / 100, 2, '.', ''), '0'), '.');
    }
}
