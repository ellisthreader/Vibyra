<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Connectors\GoogleDriveConnector;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleDriveSheetsTest extends TestCase
{
    private const ID = 'abcdefghijkl';

    public function test_spreadsheet_read_samples_multiple_tabs_with_existing_drive_scope(): void
    {
        Http::fake(function (Request $request) {
            $url = $request->url();
            if (str_contains($url, '/drive/v3/files/'.self::ID)) return Http::response([
                'id' => self::ID, 'name' => 'Plan', 'mimeType' => 'application/vnd.google-apps.spreadsheet',
                'webViewLink' => 'https://docs.google.com/spreadsheets/d/'.self::ID,
            ]);
            if (str_contains($url, 'values:batchGet')) return Http::response(['valueRanges' => [
                ['values' => [['Task', 'Owner'], ['Launch', 'Ellis']]],
                ['values' => [['Budget', 'Amount'], ['Design', '£50']]],
            ]]);
            return Http::response(['sheets' => [
                ['properties' => ['title' => 'Roadmap', 'sheetType' => 'GRID',
                    'gridProperties' => ['rowCount' => 2, 'columnCount' => 2]]],
                ['properties' => ['title' => "Costs '26", 'sheetType' => 'GRID',
                    'gridProperties' => ['rowCount' => 2, 'columnCount' => 2]]],
            ]]);
        });

        $result = app(GoogleDriveConnector::class)->run('google_drive_read', ['id' => self::ID], 'token')['result'];
        $this->assertSame(['Roadmap', "Costs '26"], $result['tabsRead']);
        $this->assertSame(2, $result['tabCount']);
        $this->assertNull($result['nextTabOffset']);
        $this->assertFalse($result['truncated']);
        $this->assertStringContainsString('Launch', $result['text']);
        $this->assertStringContainsString('£50', $result['text']);
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'values:batchGet')
            && str_contains(rawurldecode($request->url()), "Costs ''26"));
        Http::assertSentCount(3);
    }

    public function test_next_tab_offset_reads_the_remaining_tabs(): void
    {
        Http::fake(function (Request $request) {
            $url = $request->url();
            if (str_contains($url, '/drive/v3/files/'.self::ID)) return Http::response([
                'id' => self::ID, 'name' => 'Plan', 'mimeType' => 'application/vnd.google-apps.spreadsheet',
            ]);
            if (str_contains($url, 'values:batchGet')) return Http::response(['valueRanges' => array_fill(0,
                substr_count($url, 'ranges='), ['values' => [['Week', 'Task']]])]);
            return Http::response(['sheets' => array_map(static fn ($n) => ['properties' => [
                'title' => 'Week '.$n, 'sheetType' => 'GRID',
                'gridProperties' => ['rowCount' => 1, 'columnCount' => 2],
            ]], range(1, 12))]);
        });

        $connector = app(GoogleDriveConnector::class);
        $first = $connector->run('google_drive_read', $connector->validate('google_drive_read',
            ['id' => self::ID]), 'token')['result'];
        $this->assertSame(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'],
            $first['tabsRead']);
        $this->assertSame(8, $first['nextTabOffset']);
        $safe = $connector->validate('google_drive_read', ['id' => self::ID, 'tabOffset' => 8]);
        $result = $connector->run('google_drive_read', $safe, 'token')['result'];
        $this->assertSame(['Week 9', 'Week 10', 'Week 11', 'Week 12'], $result['tabsRead']);
        $this->assertSame(8, $result['tabOffset']);
        $this->assertSame(12, $result['tabCount']);
        $this->assertNull($result['nextTabOffset']);
        Http::assertSent(fn (Request $request) => str_contains(rawurldecode($request->url()), "'Week 9'!A1:Z100"));
    }

    public function test_disabled_sheets_api_falls_back_to_an_explicitly_partial_first_tab(): void
    {
        Http::fake(function (Request $request) {
            $url = $request->url();
            if (str_contains($url, '/drive/v3/files/'.self::ID.'/export')) {
                return Http::response("Task,Owner\nLaunch,Ellis\n", 200, ['Content-Type' => 'text/csv']);
            }
            if (str_contains($url, '/drive/v3/files/'.self::ID)) return Http::response([
                'id' => self::ID, 'name' => 'Plan', 'mimeType' => 'application/vnd.google-apps.spreadsheet',
            ]);
            return Http::response(['error' => ['message' => 'API disabled']], 403);
        });

        $result = app(GoogleDriveConnector::class)->run('google_drive_read', ['id' => self::ID], 'token')['result'];
        $this->assertTrue($result['truncated']);
        $this->assertStringContainsString('first tab', $result['note']);
        $this->assertStringContainsString('Launch,Ellis', $result['text']);
        Http::assertSentCount(3);
    }
}
