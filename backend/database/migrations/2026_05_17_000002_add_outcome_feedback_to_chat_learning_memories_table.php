<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_learning_memories', function (Blueprint $table) {
            $table->string('outcome_status', 32)->nullable();
            $table->tinyInteger('feedback_score')->nullable();
            $table->string('feedback_source', 40)->nullable();
            $table->timestamp('feedback_at')->nullable();
            $table->text('context_summary')->nullable();
            $table->string('error_signature', 160)->nullable();
            $table->json('file_paths')->nullable();
            $table->json('metadata')->nullable();

            $table->index(['user_id', 'outcome_status', 'updated_at'], 'clm_user_outcome_updated_idx');
            $table->index(['user_id', 'feedback_score', 'feedback_at'], 'clm_user_feedback_idx');
            $table->index(['user_id', 'error_signature'], 'clm_user_error_sig_idx');
        });
    }

    public function down(): void
    {
        Schema::table('chat_learning_memories', function (Blueprint $table) {
            $table->dropIndex('clm_user_outcome_updated_idx');
            $table->dropIndex('clm_user_feedback_idx');
            $table->dropIndex('clm_user_error_sig_idx');

            $table->dropColumn([
                'outcome_status',
                'feedback_score',
                'feedback_source',
                'feedback_at',
                'context_summary',
                'error_signature',
                'file_paths',
                'metadata',
            ]);
        });
    }
};
