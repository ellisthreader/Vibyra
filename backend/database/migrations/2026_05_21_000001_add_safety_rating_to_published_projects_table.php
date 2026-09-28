<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('published_projects', function (Blueprint $table): void {
            $table->string('safety_rating')->default('needs_review')->after('review_reason');
            $table->unsignedTinyInteger('safety_score')->default(0)->after('safety_rating');
            $table->string('review_summary', 500)->nullable()->after('safety_score');
            $table->foreignId('reviewed_by_user_id')->nullable()->after('reviewed_at')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('published_projects', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('reviewed_by_user_id');
            $table->dropColumn(['safety_rating', 'safety_score', 'review_summary']);
        });
    }
};
