<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('published_projects')
            ->where('review_status', 'manual_review')
            ->update(['review_status' => 'under_review']);
    }

    public function down(): void
    {
        DB::table('published_projects')
            ->where('review_status', 'under_review')
            ->update(['review_status' => 'manual_review']);
    }
};
