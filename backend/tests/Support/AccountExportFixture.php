<?php

namespace Tests\Support;

use App\Models\AccountExport;
use App\Services\Platform\AccountActivity;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use ZipArchive;

/** Shared by the account export tests: read the built archive and seed an account that has something in every section. */
trait AccountExportFixture
{
    /** @return array<string, string> entry name => contents */
    private function archive(?AccountExport $export = null): array
    {
        $export ??= AccountExport::query()->where('user_id', $this->user->id)->latest('requested_at')->firstOrFail();
        $zip = new ZipArchive();
        $this->assertTrue($zip->open(Storage::disk('local')->path($export->path)));
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) $files[$zip->getNameIndex($i)] = $zip->getFromIndex($i);
        $zip->close();
        return $files;
    }

    private function seedAccount(): void
    {
        $id = $this->user->id;
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $id, 'title' => 'Plan the launch', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('vibes_turns')->insert(['id' => (string) Str::uuid(), 'user_id' => $id, 'chat_id' => $chat, 'digest' => str_repeat('d', 64), 'model' => 'auto',
            'status' => 'complete', 'request' => '{"canary":"CANARY_TURN_REQUEST"}', 'allocations' => '[]', 'prompt' => 'What should we ship first?',
            'response' => 'Ship the small thing.', 'generation_id' => 'gen-CANARYGEN', 'reserved' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $skill = (string) Str::uuid();
        DB::table('agent_skills')->insert(['id' => $skill, 'user_id' => $id, 'name' => 'Triage', 'instructions' => 'Sort mail by urgency.', 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('agent_skill_assignments')->insert(['agent_id' => $this->agent['id'], 'skill_id' => $skill]);
        DB::table('vibes_wallets')->where('user_id', $id)->update(['cap_day_units' => 50000, 'cap_month_units' => 400000]);
        DB::table('cloud_sync_projects')->insert(['user_id' => $id, 'project_key' => str_repeat('a', 32), 'name' => 'my-app', 'state' => 'idle', 'created_at' => now(), 'updated_at' => now()]);
        $this->user->forceFill(['app_state' => ['theme' => 'dark', 'promptLibrary' => ['prompts' => [
            ['id' => 'p1', 'title' => 'Standup', 'text' => 'Summarise yesterday.', 'updatedAt' => '2026-10-01T10:00:00Z'],
            ['id' => 'p2', 'title' => 'Gone', 'text' => 'Deleted one.', 'updatedAt' => '2026-10-01T10:00:00Z', 'deletedAt' => '2026-10-01T11:00:00Z']]]]])->save();
        AccountActivity::record($this->user, 'spend_cap.changed', ['day' => 5]);
    }
}
