<?php

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\CloudFiles\{Files, FileTools};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Separate real process/run locks compete for one private file scope. */
final class ConcCloudFiles
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 3 private files';
        [$fx, $runs] = self::fixture();
        $race = Conc::tally(ConcRace::run(array_map(fn ($r) => self::job($fx, $r, 'note.md', 0), $runs)));
        Conc::check('six different tasks create one path once; losers get revision conflict',
            ($race['200'] ?? 0) === 1 && ($race['409:cloud_file_changed'] ?? 0) === 5
            && DB::table('agent_cloud_files')->count() === 1, json_encode($race));
        $race = Conc::tally(ConcRace::run(array_map(fn ($r) => self::job($fx, $r, 'note.md', 1), $runs)));
        Conc::check('six tasks update same revision once, with exactly two immutable versions',
            ($race['200'] ?? 0) === 1 && ($race['409:cloud_file_changed'] ?? 0) === 5
            && DB::table('agent_cloud_file_versions')->count() === 2, json_encode($race));
        DB::table('agent_cloud_file_scopes')->update(['file_count' => 99]);
        $race = Conc::tally(ConcRace::run(array_map(fn ($r, $i) => self::job($fx, $r, 'file-'.$i.'.md', 0), $runs, array_keys($runs))));
        Conc::check('separate run locks cannot overrun the private file-count quota',
            ($race['200'] ?? 0) === 1 && ($race['422'] ?? 0) === 5
            && (int) DB::table('agent_cloud_file_scopes')->value('file_count') === 100, json_encode($race));
        DB::table('agent_cloud_file_scopes')->update(['stored_bytes' => Files::TOTAL_BYTES - 4]);
        $race = Conc::tally(ConcRace::run(array_map(fn ($r) => self::job($fx, $r, 'note.md', 2), $runs)));
        Conc::check('saved-version byte quota rejects every over-budget mutation without partial revision',
            ($race['422'] ?? 0) === 6 && (int) DB::table('agent_cloud_files')->where('path', 'note.md')->value('revision') === 2,
            json_encode($race));
    }

    private static function fixture(): array
    {
        $fx = ConcFixture::make(false);
        ConcFixture::admit($fx, 'Save private notes');
        $claimed = ConcFixture::claim($fx);
        $workspace = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $workspace, 'user_id' => $fx['user'], 'name' => 'Test',
            'project_id' => 'test', 'app_name' => 'test-'.Str::random(10), 'state' => 'ready']);
        $row = Run::findOrFail($claimed['id']);
        $row->forceFill(['runtime_snapshot' => [...$row->runtime_snapshot,
            'executionTarget' => 'cloud', 'cloudWorkspaceId' => $workspace]])->save();
        $runs = [$claimed];
        foreach (range(2, 6) as $i) {
            $copy = $row->replicate();
            $copy->id = (string) Str::uuid();
            $copy->idempotency_key = 'cloud-files-'.$i;
            $copy->conversation_seq = $i;
            $copy->save();
            $runs[] = [...$claimed, 'id' => $copy->id];
        }
        return [$fx, $runs];
    }

    private static function job(array $fx, array $run, string $path, int $revision): array
    {
        return ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$run['id'].'/tools', 'json' => [
            'generation' => $run['generation'], 'callId' => 'save-'.$path.'-'.$revision, 'tool' => 'cloud_write_file',
            'connectionId' => $run['id'], 'schemaRevision' => FileTools::revision('cloud_write_file'),
            'arguments' => ['path' => $path, 'revision' => $revision, 'content' => 'Note from '.$run['id']]]];
    }
}
