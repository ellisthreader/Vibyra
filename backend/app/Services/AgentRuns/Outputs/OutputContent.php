<?php

namespace App\Services\AgentRuns\Outputs;

use App\Services\AgentRuns\Tools\Providers\Schema;

/** Only data for trusted renderers: no script, HTML, remote preview or executable field. */
final class OutputContent
{
    public static function validate(string $kind, array $content): array
    {
        abort_unless(strlen(json_encode($content)) <= 64000, 422, 'Keep this output under 64 KB.');
        if ($kind === 'text') {
            Schema::only($content, ['text']);
            return ['text' => Schema::text($content['text'] ?? null, 30000, 'Add text under 30,000 characters.')];
        }
        if ($kind === 'checklist') {
            Schema::only($content, ['items']);
            $items = $content['items'] ?? null;
            abort_unless(is_array($items) && array_is_list($items) && count($items) <= 100, 422, 'Use at most 100 checklist items.');
            $ids = [];
            foreach ($items as &$item) {
                abort_unless(is_array($item), 422, 'Each checklist item must be an object.');
                Schema::only($item, ['id', 'text', 'checked']);
                $id = $item['id'] ?? null;
                abort_unless(is_string($id) && preg_match('/\A[a-zA-Z0-9_-]{1,80}\z/D', $id) && !isset($ids[$id]),
                    422, 'Use unique simple item IDs.');
                abort_unless(is_bool($item['checked'] ?? null), 422, 'checked must be true or false.');
                $ids[$id] = true;
                $item = ['id' => $id, 'text' => Schema::text($item['text'] ?? null, 1000, 'Add short item text.'),
                    'checked' => $item['checked']];
            }
            return ['items' => $items];
        }
        abort_unless($kind === 'table', 422, 'Choose checklist, table or text.');
        Schema::only($content, ['columns', 'rows']);
        $columns = $content['columns'] ?? null;
        $rows = $content['rows'] ?? null;
        abort_unless(is_array($columns) && array_is_list($columns) && count($columns) >= 1 && count($columns) <= 12,
            422, 'Use 1 to 12 columns.');
        $columns = array_map(fn ($v) => Schema::line($v, 160, 'Use short column names.'), $columns);
        abort_unless(is_array($rows) && array_is_list($rows) && count($rows) <= 100, 422, 'Use at most 100 rows.');
        foreach ($rows as &$row) {
            abort_unless(is_array($row) && array_is_list($row) && count($row) === count($columns), 422, 'Every row must match the columns.');
            $row = array_map(fn ($v) => Schema::text($v, 2000, 'Keep cells under 2,000 characters.', false) ?? '', $row);
        }
        return ['columns' => $columns, 'rows' => $rows];
    }
}
