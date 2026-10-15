<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Existing installations may already have run the first membership
        // migration with restrictive user foreign keys.
        foreach (['membership_orders', 'membership_owners', 'membership_periods'] as $tableName) {
            if (! Schema::hasTable($tableName)) {
                continue;
            }
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['user_id']);
            });
            Schema::table($tableName, function (Blueprint $table): void {
                $table->unsignedBigInteger('user_id')->nullable()->change();
                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        // A deleted owner's retained transaction must not be re-linked or made
        // invalid by rolling this migration back.
    }
};
