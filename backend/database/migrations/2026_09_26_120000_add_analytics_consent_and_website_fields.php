<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_consents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('surface', 16);
            $table->string('subject_hash', 64);
            $table->string('choice', 16);
            $table->unsignedSmallInteger('policy_version');
            $table->timestamp('consented_at')->nullable();
            $table->timestamp('withdrawn_at')->nullable();
            $table->timestamps();
            $table->unique(['surface', 'subject_hash']);
            $table->index(['user_id', 'surface']);
        });

        Schema::create('analytics_consent_changes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('surface', 16);
            $table->string('subject_hash', 64);
            $table->string('old_choice', 16)->nullable();
            $table->string('new_choice', 16);
            $table->unsignedSmallInteger('policy_version');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['subject_hash', 'created_at']);
        });

        Schema::table('analytics_events', function (Blueprint $table): void {
            $table->string('consent_subject_hash', 64)->nullable()->index();
            $table->string('country_code', 2)->nullable()->index();
            $table->unsignedTinyInteger('engaged_seconds')->nullable();
            $table->unsignedSmallInteger('schema_version')->default(1);
        });
    }

    public function down(): void
    {
        Schema::table('analytics_events', function (Blueprint $table): void {
            $table->dropColumn(['consent_subject_hash', 'country_code', 'engaged_seconds', 'schema_version']);
        });
        Schema::dropIfExists('analytics_consent_changes');
        Schema::dropIfExists('analytics_consents');
    }
};
