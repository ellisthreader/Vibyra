<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('analytics_events', function (Blueprint $table): void {
            $table->string('region_code', 12)->nullable();
            $table->string('acquisition_channel', 16)->nullable();
            $table->string('source', 48)->nullable();
            $table->string('medium', 32)->nullable();
            $table->string('campaign', 64)->nullable();
            $table->string('referrer_domain', 100)->nullable();
            $table->string('device_type', 12)->nullable();
            $table->string('browser_family', 16)->nullable();
            $table->string('metric_name', 12)->nullable();
            $table->unsignedInteger('metric_value')->nullable();
            $table->string('error_category', 16)->nullable();
            $table->index(['surface', 'event', 'visitor_hash', 'occurred_at'], 'analytics_website_funnel_idx');
        });
    }

    public function down(): void
    {
        Schema::table('analytics_events', function (Blueprint $table): void {
            $table->dropIndex('analytics_website_funnel_idx');
            $table->dropColumn(['region_code', 'acquisition_channel', 'source', 'medium',
                'campaign', 'referrer_domain', 'device_type', 'browser_family',
                'metric_name', 'metric_value', 'error_category']);
        });
    }
};
