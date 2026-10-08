<?php

namespace App\Services\AgentRuns\Outputs;

use App\Models\AgentV2\Output;

final class OutputExport
{
    public function make(Output $output, string $format): array
    {
        $payload = app(Outputs::class)->payload($output);
        if ($format === 'json') return ['filename' => 'output-'.$output->id.'.json', 'contentType' => 'application/json',
            'content' => json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)];
        $escape = fn ($s) => str_replace(["\r", "\n", '|', '<', '>'], [' ', ' ', '\\|', '&lt;', '&gt;'], $s);
        $lines = ['# '.$escape($output->title), '', 'Revision '.$output->revision, 'Task: '.$output->run_id, ''];
        if ($output->kind === 'checklist') {
            foreach ($output->content['items'] as $item) $lines[] = '- ['.($item['checked'] ? 'x' : ' ').'] '.$escape($item['text']);
        } elseif ($output->kind === 'table') {
            $lines[] = '| '.implode(' | ', array_map($escape, $output->content['columns'])).' |';
            $lines[] = '| '.implode(' | ', array_fill(0, count($output->content['columns']), '---')).' |';
            foreach ($output->content['rows'] as $row) $lines[] = '| '.implode(' | ', array_map($escape, $row)).' |';
        } else $lines[] = str_replace(['<', '>'], ['&lt;', '&gt;'], $output->content['text']);
        $lines[] = '';
        $lines[] = 'Source task: '.($output->sources['runId'] ?? $output->run_id);
        foreach ($output->sources['actionIds'] ?? [] as $id) $lines[] = 'Source action: '.$id;
        return ['filename' => 'output-'.$output->id.'.md', 'contentType' => 'text/markdown', 'content' => implode("\n", $lines)."\n"];
    }
}
