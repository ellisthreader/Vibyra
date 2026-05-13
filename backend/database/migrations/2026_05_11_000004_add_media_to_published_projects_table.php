<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('published_projects', function (Blueprint $table) {
            $table->longText('logo_image_url')->nullable()->after('tags');
            $table->json('screenshot_urls')->nullable()->after('logo_image_url');
        });
    }

    public function down(): void
    {
        Schema::table('published_projects', function (Blueprint $table) {
            $table->dropColumn(['logo_image_url', 'screenshot_urls']);
        });
    }
};
