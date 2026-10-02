<?php
namespace App\Console\Commands;

use App\Services\Assistant\Budget;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\{DB, Schema};

final class RecoverAssistantReservations extends Command
{
    protected $signature = 'vibyra:recover-assistant';
    protected $description = 'Release stranded customer holds while retaining uncertain provider spend';
    public function handle(): int
    {
        if (!Schema::hasTable('assistant_requests')) return self::SUCCESS;
        DB::table('assistant_requests')->where('state', 'reserved')->where('created_at', '<', now()->subMinutes(5))
            ->orderBy('id')->chunkById(100, function ($rows) {
                foreach ($rows as $row) app(Budget::class)->finish($row->id, null);
            });
        return self::SUCCESS;
    }
}
