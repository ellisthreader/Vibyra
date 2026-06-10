<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $duplicate = DB::table('iap_receipts')
            ->select('platform', 'original_transaction_id')
            ->whereNotNull('original_transaction_id')
            ->where('original_transaction_id', '!=', '')
            ->groupBy('platform', 'original_transaction_id')
            ->havingRaw('COUNT(*) > 1')
            ->first();

        if ($duplicate) {
            throw new RuntimeException(
                'Cannot enforce canonical IAP identity: duplicate '
                ."{$duplicate->platform}/{$duplicate->original_transaction_id} receipts exist."
            );
        }

        Schema::table('iap_receipts', function (Blueprint $table): void {
            $table->string('client_transaction_id', 128)->nullable()->after('transaction_id');
            $table->string('environment', 24)->default('unknown')->after('original_transaction_id');
            $table->string('purchase_state', 64)->default('verified')->after('environment');
            $table->unique(
                ['platform', 'original_transaction_id'],
                'iap_receipts_platform_original_unique'
            );
        });

        DB::table('iap_receipts')
            ->whereNull('client_transaction_id')
            ->update(['client_transaction_id' => DB::raw('transaction_id')]);
    }

    public function down(): void
    {
        Schema::table('iap_receipts', function (Blueprint $table): void {
            $table->dropUnique('iap_receipts_platform_original_unique');
            $table->dropColumn([
                'client_transaction_id',
                'environment',
                'purchase_state',
            ]);
        });
    }
};
