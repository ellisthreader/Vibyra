<?php

use Illuminate\Support\Facades\{Artisan, DB, Schema};

/** Exercise an in-place upgrade and rollback with existing task/approval data, on disposable PG only. */
final class ConcStageTwoUpgrade
{
    public static function run(): void
    {
        Conc::$scenario = 'stage2 migration upgrade';
        conc_guard();
        $new = ['2026_10_08_120000_extend_agent_email_drafts', '2026_10_08_120000_add_agent_drafts_outputs', '2026_10_08_100000_create_agent_memories',
            '2026_10_08_100000_add_agent_run_instructions'];
        if (DB::table('migrations')->whereIn('migration', $new)->count() !== 4)
            throw new RuntimeException('Refusing rollback: all four Stage 2 migration records are required.');
        $baseline = DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson();
        $catalog = self::seedCatalog();
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Prepare a test upgrade email.');
        $run = ConcFixture::claim($fx);
        $action = ConcFixture::write($fx, $run, ['to' => 'fixture@example.com', 'subject' => 'Upgrade', 'body' => 'Do not send'], 'upgrade');
        $before = self::snapshot($run['id'], $action['id']);
        $migrationCount = DB::table('migrations')->count();
        for ($round = 1; $round <= 2; $round++) {
            // Emulate Stage 2 deployed after all current live migrations, regardless of filename timestamp.
            // conc_guard() confines this migration-ledger adjustment to the throwaway PostgreSQL database.
            $batch = (int) DB::table('migrations')->max('batch') + 1;
            DB::table('migrations')->whereIn('migration', $new)->update(['batch' => $batch]);
            if (DB::table('migrations')->where('batch', $batch)->count() !== 4)
                throw new RuntimeException('Refusing rollback: the isolated Stage 2 batch must contain exactly four records.');
            $status = Artisan::call('migrate:rollback', ['--batch' => $batch, '--force' => true]);
            $oldSchema = !Schema::hasColumn('agent_runs', 'instruction_revision')
                && !Schema::hasColumn('agent_tool_actions', 'draft_original_connection_id')
                && !Schema::hasColumn('agent_tool_actions', 'draft_revision') && !Schema::hasTable('agent_outputs');
            Conc::check('rollback '.$round.' leaves baseline task and exact pending approval unchanged', $status === 0
                && $oldSchema && self::snapshot($run['id'], $action['id']) === $before
                && DB::table('migrations')->count() === $migrationCount - 4
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline
                && self::catalogSnapshot() === $catalog);
            $status = Artisan::call('migrate', ['--force' => true]);
            Conc::check('upgrade '.$round.' preserves baseline data and supplies safe defaults', $status === 0
                && self::snapshot($run['id'], $action['id']) === $before && Schema::hasTable('agent_outputs')
                && Schema::hasColumn('agent_tool_actions', 'draft_original_connection_id')
                && Schema::hasColumn('agent_draft_revisions', 'connection_id') && Schema::hasTable('agent_memories') && Schema::hasTable('agent_run_instructions')
                && DB::table('agent_runs')->where('id', $run['id'])->value('instruction_revision') === 0
                && DB::table('agent_tool_actions')->where('id', $action['id'])->value('draft_revision') === 1
                && DB::table('migrations')->count() === $migrationCount
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline
                && self::catalogSnapshot() === $catalog);
        }
        Conc::check('migration verification never dispatched the pending provider write', ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 0);
    }

    /** Seed each newer catalogue table so an accidental rollback cannot be hidden by an empty recreate. */
    private static function seedCatalog(): array
    {
        $rows = [
            'state' => ['id' => 1, 'revision' => 41, 'last_run_at' => now()],
            'models' => ['id' => 'fixture/model', 'fingerprint' => str_repeat('a', 64), 'metadata' => '{}', 'status' => 'eligible', 'seen_at' => now()],
            'revisions' => ['id' => 41, 'content_hash' => str_repeat('b', 64), 'payload' => '{}', 'key_id' => 'fixture', 'signature' => str_repeat('c', 128), 'created_at' => now()],
            'budgets' => ['id' => 'fixture-budget', 'reserved_micro' => 123],
            'artwork' => ['sha256' => str_repeat('d', 64), 'png_base64' => 'Zml4dHVyZQ==', 'created_at' => now()],
            'attempts' => ['id' => '00000000-0000-4000-8000-000000000041', 'model_id' => 'fixture/model', 'fingerprint' => str_repeat('a', 64),
                'kind' => 'probe', 'state' => 'unknown', 'reserved_micro' => 123, 'created_at' => now()],
        ];
        foreach ($rows as $name => $row) DB::table('model_catalog_'.$name)->insert($row);
        return self::catalogSnapshot();
    }

    private static function catalogSnapshot(): array
    {
        $out = [];
        foreach (['state', 'models', 'revisions', 'budgets', 'artwork', 'attempts'] as $name) {
            if (!Schema::hasTable('model_catalog_'.$name)) return [];
            $out[$name] = DB::table('model_catalog_'.$name)->get()->toJson();
        }
        return $out;
    }

    private static function snapshot(string $run, string $action): array
    {
        return [(array) DB::table('agent_runs')->where('id', $run)->first(['id', 'prompt', 'state', 'runtime_snapshot', 'grant_snapshot']),
            (array) DB::table('agent_tool_actions')->where('id', $action)->first(['id', 'arguments', 'fingerprint', 'state', 'dispatched_at'])];
    }
}
