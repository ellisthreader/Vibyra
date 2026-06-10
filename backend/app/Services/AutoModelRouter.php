<?php

namespace App\Services;

use App\Services\Billing\CreditCalculator;

class AutoModelRouter
{
    private const FREE_PLAN_MODEL = 'gpt-5.4-mini';

    private const ROUTES = [
        'visual_frontend' => [
            'modelKey' => 'google/gemini-3.1-pro-preview',
            'reason' => 'Strong fit for visual, frontend, and interactive interface work.',
        ],
        'large_codebase' => [
            'modelKey' => 'anthropic/claude-sonnet-4.6',
            'reason' => 'Strong fit for long-context codebase analysis and multi-file implementation.',
        ],
        'complex_review' => [
            'modelKey' => 'anthropic/claude-opus-4.8',
            'reason' => 'Strong fit for difficult reviews, debugging, architecture, and high-stakes reasoning.',
        ],
        'agentic_coding' => [
            'modelKey' => 'openai/gpt-5.5',
            'reason' => 'Strong fit for agentic coding, tool use, implementation, and verification.',
        ],
        'research_reasoning' => [
            'modelKey' => 'google/gemini-3.1-pro-preview',
            'reason' => 'Strong fit for research synthesis, technical reasoning, and complex data.',
        ],
        'fast_general' => [
            'modelKey' => 'google/gemini-3.5-flash',
            'reason' => 'Fast, efficient fit for focused questions and straightforward tasks.',
        ],
    ];

    public function route(
        string $prompt,
        string $plan,
        CreditCalculator $calculator,
        array $allowedProviders = [],
    ): array
    {
        $category = $this->category($prompt);
        $route = self::ROUTES[$category];
        $preferredModel = $route['modelKey'];
        $providers = $this->normalizedProviders($allowedProviders);
        $selectedModel = $this->allowedModel($preferredModel, $plan, $calculator, $providers);

        return [
            'category' => $category,
            'modelKey' => $selectedModel,
            'preferredModelKey' => $preferredModel,
            'allowedProviders' => $providers,
            'reason' => $selectedModel === $preferredModel
                ? $route['reason']
                : ($providers === []
                    ? 'Selected the strongest Auto model included with the current plan.'
                    : 'Selected the strongest Auto model supported by this terminal and included with the current plan.'),
        ];
    }

    private function category(string $prompt): string
    {
        $value = mb_strtolower($prompt);

        if ($this->matches($value, [
            'frontend', 'front-end', 'ui ', ' ui', 'ux ', ' ux', 'css', 'html', 'tailwind',
            'component', 'responsive', 'layout', 'animation', '3d', 'svg', 'visual', 'design',
            'landing page', 'dashboard', 'screenshot', 'pixel perfect', 'pixel-perfect',
        ])) {
            return 'visual_frontend';
        }

        if ($this->matches($value, [
            'entire codebase', 'whole codebase', 'large codebase', 'repo-wide', 'repository-wide',
            'many files', 'multi-file', 'across the repo', 'across the project',
            'long context', 'large document', 'all files', 'monorepo',
        ])) {
            return 'large_codebase';
        }

        if ($this->matches($value, [
            'security review', 'threat model', 'audit', 'root cause', 'race condition',
            'architecture', 'architect', 'code review', 'review this', 'debug complex',
            'production incident', 'data loss', 'high stakes', 'high-stakes',
        ])) {
            return 'complex_review';
        }

        if ($this->matches($value, [
            'implement', 'build ', 'create ', 'write code', 'fix ', 'debug ', 'refactor',
            'test ', 'tests ', 'api ', 'database', 'terminal', 'command', 'script',
            'typescript', 'javascript', 'python', 'php', 'rust', 'golang', 'java ',
        ])) {
            return 'agentic_coding';
        }

        if ($this->matches($value, [
            'research', 'compare', 'investigate', 'analyze', 'analyse', 'reason about',
            'explain why', 'scientific', 'mathematical', 'dataset', 'data analysis',
            'sources', 'evidence', 'current ', 'latest ',
        ])) {
            return 'research_reasoning';
        }

        return 'fast_general';
    }

    private function allowedModel(
        string $preferred,
        string $plan,
        CreditCalculator $calculator,
        array $allowedProviders,
    ): string
    {
        if ($plan === 'free'
            && $this->providerAllowed(self::FREE_PLAN_MODEL, $allowedProviders)
            && $calculator->modelConfig(self::FREE_PLAN_MODEL)
            && $calculator->planAllowsModel($plan, self::FREE_PLAN_MODEL)) {
            return self::FREE_PLAN_MODEL;
        }

        foreach ([$preferred, 'openai/gpt-5.5', self::FREE_PLAN_MODEL, 'google/gemini-3.5-flash'] as $candidate) {
            if ($this->providerAllowed($candidate, $allowedProviders)
                && $calculator->modelConfig($candidate)
                && $calculator->planAllowsModel($plan, $candidate)) {
                return $candidate;
            }
        }

        return 'auto';
    }

    private function normalizedProviders(array $providers): array
    {
        return array_values(array_unique(array_filter(array_map(
            static fn ($provider) => strtolower(trim((string) $provider)),
            $providers,
        ), static fn (string $provider) => in_array(
            $provider,
            ['openai', 'anthropic', 'google', 'qwen', 'moonshot', 'mistral'],
            true,
        ))));
    }

    private function providerAllowed(string $model, array $allowedProviders): bool
    {
        if ($allowedProviders === []) {
            return true;
        }

        $provider = str_contains($model, '/')
            ? strtolower((string) strstr($model, '/', true))
            : match (true) {
                str_starts_with($model, 'gpt-'), str_contains($model, 'codex') => 'openai',
                str_starts_with($model, 'claude-') => 'anthropic',
                str_starts_with($model, 'gemini-') => 'google',
                default => '',
            };

        return in_array($provider, $allowedProviders, true);
    }

    private function matches(string $prompt, array $terms): bool
    {
        foreach ($terms as $term) {
            if (str_contains($prompt, $term)) {
                return true;
            }
        }

        return false;
    }
}
