<?php

namespace App\Services\Reporting;

use Illuminate\Support\Str;

class DiscordReportFormatter
{
    public function payload(array $report, string $id, bool $hasScreenshot): array
    {
        $context = $report['context'];
        $reporter = $context['reporter'];
        $fields = [
            $this->field('Where', $this->value($report['area'] ?? null), true),
            $this->field('Version', $this->value($context['appVersion'] ?? null), true),
            $this->field('Platform', $this->value($context['platform'] ?? null), true),
        ];
        if ($this->filled($context['project'] ?? null) || $this->filled($context['agent'] ?? null)) {
            $fields[] = $this->field('Project', $this->value($context['project'] ?? null), true);
            $fields[] = $this->field('Agent', $this->value($context['agent'] ?? null), true);
            $fields[] = $this->field('Model', $this->value($context['model'] ?? null), true);
        }
        if ($this->filled($report['steps'] ?? null)) {
            $fields[] = $this->field('Steps to reproduce', $report['steps'], false);
        }
        if ($this->filled($report['expected'] ?? null)) {
            $fields[] = $this->field('Expected', $report['expected'], false);
        }
        $embed = [
            'author' => ['name' => $this->clip("Reported by {$reporter}", 250)],
            'title' => $this->clip($this->title($report), 250),
            'description' => $this->clip($report['details'], 1500),
            'color' => $this->color($report['severity']),
            'fields' => $fields,
            'timestamp' => now()->utc()->format('Y-m-d\TH:i:s\Z'),
            'footer' => ['text' => "{$id} · full context attached"],
        ];
        if ($hasScreenshot) {
            $embed['image'] = ['url' => 'attachment://screenshot.png'];
        }

        return ['allowed_mentions' => ['parse' => []], 'embeds' => [$embed]];
    }

    public function contextText(array $report, string $id): string
    {
        $context = $report['context'];
        $text = "Vibyra report {$id}\n".now()->utc()->toIso8601String()."\n\n";
        $text .= $this->row('Kind', $this->kind($report['kind']));
        $text .= $this->row('Severity', $this->severity($report['severity']));
        $text .= $this->row('Where', $this->value($report['area'] ?? null));
        $text .= $this->row('Summary', trim($report['summary']));
        $text .= $this->section('What happened', $report['details']);
        $text .= $this->section('Steps to reproduce', $report['steps'] ?? '');
        $text .= $this->section('Expected', $report['expected'] ?? '');
        $environment = '';
        foreach ($this->environmentRows($report, $context) as [$label, $value]) {
            $environment .= $this->row($label, $this->value($value));
        }
        $text .= $this->section('Environment', $environment);
        $text .= $this->section('Terminal output (last 120 lines)', $report['terminalTail'] ?? '');

        return $text;
    }

    private function environmentRows(array $report, array $context): array
    {
        return [
            ['App version', $context['appVersion'] ?? null],
            ['Platform', $context['platform'] ?? null],
            ['Renderer', $context['renderer'] ?? null],
            ['Screen', $context['screen'] ?? null],
            ['Locale', $context['locale'] ?? null],
            ['View', $context['view'] ?? null],
            ['Project', $context['project'] ?? null],
            ['Folder', $context['projectRoot'] ?? null],
            ['Agent', $context['agent'] ?? null],
            ['Model', $context['model'] ?? null],
            ['Pane', $context['pane'] ?? null],
            ['Reporter', $context['reporter']],
            ['Account ID', $context['accountId']],
            ['Contact', $report['contact'] ?? null],
        ];
    }

    private function title(array $report): string
    {
        return sprintf('%s · %s — %s', $this->kind($report['kind']),
            $this->severity($report['severity']), $this->clip($report['summary'], 180));
    }

    private function kind(string $kind): string
    {
        return match ($kind) {
            'crash' => '💥 Crash', 'visual' => '🎨 Visual glitch',
            'performance' => '🐌 Performance', 'idea' => '💡 Idea',
            'question' => '❓ Question', default => '🐞 Bug',
        };
    }

    private function severity(string $severity): string
    {
        return match ($severity) {
            'blocker' => 'Blocker', 'high' => 'High', 'low' => 'Low', default => 'Normal'
        };
    }

    private function color(string $severity): int
    {
        return match ($severity) {
            'blocker' => 0xE5484D, 'high' => 0xF76808, 'low' => 0x8B8F9E, default => 0x5B7CFA
        };
    }

    private function field(string $name, string $value, bool $inline): array
    {
        return ['name' => $name, 'value' => $this->clip($value, 700), 'inline' => $inline];
    }

    private function clip(string $value, int $limit): string
    {
        return Str::limit(trim($value), $limit, '…');
    }

    private function value(mixed $value): string
    {
        $value = trim((string) $value);

        return $value === '' ? '—' : $value;
    }

    private function filled(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    private function row(string $label, string $value): string
    {
        return str_pad($label, 14).$value."\n";
    }

    private function section(string $title, string $body): string
    {
        $body = trim($body);

        return $body === '' ? '' : "\n--- {$title} ---\n{$body}\n";
    }
}
