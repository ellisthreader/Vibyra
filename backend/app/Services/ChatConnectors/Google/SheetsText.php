<?php

namespace App\Services\ChatConnectors\Google;

use RuntimeException;

/** Read a bounded page of grid tabs without expanding Drive's OAuth scope. */
final class SheetsText
{
    private const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
    private const MAX_TABS = 8;
    private const MAX_ROWS = 100;
    private const MAX_COLUMNS = 26;
    private const MAX_TEXT = 16000;

    public function __construct(private readonly Client $google) {}

    public function read(string $token, string $id, int $tabOffset = 0): array
    {
        $metadata = $this->google->get($token, self::BASE.$id, [
            'includeGridData' => 'false',
            'fields' => 'sheets(properties(title,sheetType,gridProperties(rowCount,columnCount)))',
        ]);
        $all = array_values(array_filter($metadata['sheets'] ?? [], static fn ($sheet) =>
            is_array($sheet) && ($sheet['properties']['sheetType'] ?? 'GRID') === 'GRID'
            && is_string($sheet['properties']['title'] ?? null)));
        if ($all === []) throw new RuntimeException('The spreadsheet has no readable grid tabs.');
        if ($tabOffset >= count($all)) throw new RuntimeException('No spreadsheet tabs remain at that offset.');

        $selected = array_slice($all, $tabOffset, self::MAX_TABS);
        $ranges = array_map(static function ($sheet): string {
            $title = str_replace("'", "''", $sheet['properties']['title']);
            return "'{$title}'!A1:Z".self::MAX_ROWS;
        }, $selected);
        $query = implode('&', array_map(static fn ($range) => 'ranges='.rawurlencode($range), $ranges));
        $body = $this->google->get($token, self::BASE.$id.'/values:batchGet?'
            .'majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&'.$query);
        $values = $body['valueRanges'] ?? null;
        if (!is_array($values) || count($values) !== count($selected)) {
            throw new RuntimeException('Google Sheets returned an incomplete tab read.');
        }

        $perTab = intdiv(self::MAX_TEXT, count($selected));
        $sections = [];
        $tabNames = [];
        $nextOffset = $tabOffset + count($selected);
        $truncated = $tabOffset > 0 || count($all) > $nextOffset;
        foreach ($selected as $index => $sheet) {
            $title = $sheet['properties']['title'];
            $tabNames[] = $title;
            $header = 'Tab: '.$title."\n";
            $remaining = max(0, $perTab - mb_strlen($header));
            $lines = [];
            $rows = $values[$index]['values'] ?? [];
            if (!is_array($rows)) throw new RuntimeException('Google Sheets returned invalid rows.');
            foreach (array_slice($rows, 0, self::MAX_ROWS) as $row) {
                if (!is_array($row)) continue;
                $cells = array_map(static fn ($cell) => mb_substr((string) $cell, 0, 300),
                    array_slice($row, 0, self::MAX_COLUMNS));
                $line = json_encode($cells, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if (!is_string($line) || mb_strlen($line) + 1 > $remaining) {
                    $truncated = true;
                    break;
                }
                $lines[] = $line;
                $remaining -= mb_strlen($line) + 1;
                if (count($row) > self::MAX_COLUMNS) $truncated = true;
            }
            $grid = $sheet['properties']['gridProperties'] ?? [];
            if (($grid['rowCount'] ?? 0) > self::MAX_ROWS || ($grid['columnCount'] ?? 0) > self::MAX_COLUMNS
                || count($rows) > self::MAX_ROWS) $truncated = true;
            $sections[] = $header.implode("\n", $lines);
        }
        return ['text' => implode("\n\n", $sections), 'tabsRead' => $tabNames,
            'tabCount' => count($all), 'tabOffset' => $tabOffset,
            'nextTabOffset' => $nextOffset < count($all) ? $nextOffset : null,
            'truncated' => $truncated,
            'note' => 'Up to 8 grid tabs, 100 rows and 26 columns per tab; bounded text sample.'];
    }
}
