<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('membership_licenses', function (Blueprint $table) {
            // Existing owner-issued pilot licenses are included without changing their terms.
            $table->boolean('beta_welcome')->default(true);
            $table->timestamp('beta_welcome_seen_at')->nullable();
        });
    }

    public function down(): void
    {
        throw new RuntimeException('Keep license welcome acknowledgements; this migration is forward-only.');
    }
};
