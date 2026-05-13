<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('published_projects', function (Blueprint $table) {
            $table->string('review_status')->default('pending')->index()->after('visibility');
            $table->json('review_flags')->nullable()->after('review_status');
            $table->text('review_reason')->nullable()->after('review_flags');
            $table->timestamp('reviewed_at')->nullable()->after('review_reason');
        });

        DB::table('published_projects')
            ->where('visibility', 'public')
            ->whereNotNull('published_at')
            ->update([
                'review_status' => 'approved',
                'reviewed_at' => DB::raw('COALESCE(updated_at, created_at)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('published_projects', function (Blueprint $table) {
            $table->dropColumn(['review_status', 'review_flags', 'review_reason', 'reviewed_at']);
        });
    }
};
