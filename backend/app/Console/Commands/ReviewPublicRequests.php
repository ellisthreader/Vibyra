<?php

namespace App\Console\Commands;

use App\Models\PublicRequest;
use Illuminate\Console\Command;

class ReviewPublicRequests extends Command
{
    protected $signature = 'vibyra:requests {--format=table : table or csv} {--limit=100 : Maximum rows (1-500)} {--offset=0 : Rows to skip} {--set-status= : Reference:reviewing or Reference:closed}';
    protected $description = 'Review stored privacy, refund, community, and accessibility requests';

    public function handle(): int
    {
        $format = $this->option('format');
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT);
        $offset = filter_var($this->option('offset'), FILTER_VALIDATE_INT);
        if (! in_array($format, ['table', 'csv'], true) || $limit === false || $limit < 1 || $limit > 500 || $offset === false || $offset < 0) {
            $this->error('Use --format=table|csv, --limit=1..500 and --offset=0 or greater.');
            return self::FAILURE;
        }

        if ($statusChange = $this->option('set-status')) {
            [$reference, $status] = array_pad(explode(':', $statusChange, 2), 2, '');
            if (! preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/', $reference)
                || ! in_array($status, ['reviewing', 'closed'], true)
                || PublicRequest::query()->where('reference', $reference)->update([
                    'status' => $status,
                    'closed_at' => $status === 'closed' ? now() : null,
                ]) !== 1) {
                $this->error('Use --set-status=REFERENCE:reviewing|closed for an existing request.');
                return self::FAILURE;
            }
            $this->info("Updated {$reference} to {$status}.");
        }

        $rows = PublicRequest::query()->orderByDesc('created_at')->orderByDesc('id')->offset($offset)->limit($limit)
            ->get(['reference', 'created_at', 'topic', 'status', 'email', 'details'])
            ->map(fn (PublicRequest $row) => [
                $row->reference,
                $row->created_at->toIso8601String(),
                $row->topic,
                $row->status,
                $row->email,
                $row->details ?? '',
            ])->all();
        $headers = ['reference', 'received_at', 'topic', 'status', 'email', 'details'];

        if ($format === 'table') {
            $this->table($headers, $rows);
            return self::SUCCESS;
        }

        $stream = fopen('php://temp', 'w+');
        fputcsv($stream, $headers);
        foreach ($rows as $row) {
            fputcsv($stream, array_map(static function (string $cell): string {
                return preg_match('/^[\s]*[=+\-@]/u', $cell) ? "'".$cell : $cell;
            }, $row));
        }
        rewind($stream);
        $this->output->write(stream_get_contents($stream));
        fclose($stream);
        return self::SUCCESS;
    }
}
