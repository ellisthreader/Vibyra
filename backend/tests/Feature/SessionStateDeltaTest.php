<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SessionStateDeltaTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $user = User::factory()->create(['app_state' => ['chatTitles' => ['one' => 'Before']]]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'delta-fixture'),
            'device_name' => 'Fixture', 'last_used_at' => now(), 'idle_expires_at' => now()->addHour(),
            'absolute_expires_at' => now()->addDay()]);
        return [$user, ['Authorization' => 'Bearer delta-fixture']];
    }

    private function change(array $path, mixed $before, mixed $value): array
    {
        return ['path' => $path, 'beforePresent' => true, 'before' => $before, 'remove' => false, 'value' => $value];
    }

    public function test_legacy_response_is_preserved_and_ack_is_compact(): void
    {
        [, $headers] = $this->fixture();
        $body = ['appState' => ['chatTitles' => ['one' => 'After']]];
        $this->postJson('/api/session/state', $body, $headers)->assertOk()->assertJsonPath('user.appState.chatTitles.one', 'After');
        $response = $this->postJson('/api/session/state', [...$body, 'responseMode' => 'ack-v1'], $headers)
            ->assertOk()->assertExactJson(['ok' => true, 'syncVersion' => 1]);
        $this->assertLessThan(128, strlen($response->getContent()));
    }

    public function test_delta_preserves_other_clients_changes_and_can_be_replayed(): void
    {
        [$user, $headers] = $this->fixture();
        $user->forceFill(['app_state' => ['chatTitles' => ['one' => 'Before', 'remote' => 'Keep me']]])->save();
        $body = ['syncVersion' => 1, 'changes' => [$this->change(['appState', 'chatTitles', 'one'], 'Before', 'After')]];
        $this->postJson('/api/session/state/delta', $body, $headers)->assertOk();
        $this->postJson('/api/session/state/delta', $body, $headers)->assertOk();
        $this->assertSame(['one' => 'After', 'remote' => 'Keep me'], $user->fresh()->app_state['chatTitles']);
    }

    public function test_conflicting_batch_is_atomic_and_never_overwrites_cloud_state(): void
    {
        [$user, $headers] = $this->fixture();
        $changes = [
            ['path' => ['appState', 'chatTitles', 'new'], 'beforePresent' => false, 'remove' => false, 'value' => 'New'],
            $this->change(['appState', 'chatTitles', 'one'], 'Stale', 'Overwrite'),
        ];
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => $changes], $headers)->assertStatus(409);
        $this->assertSame(['one' => 'Before'], $user->fresh()->app_state['chatTitles']);
    }

    public function test_message_change_and_thread_deletion_keep_array_order(): void
    {
        [$user, $headers] = $this->fixture();
        $threads = ['one' => [['text' => 'A'], ['text' => 'B']], 'two' => [['text' => 'Keep']]];
        $user->forceFill(['app_state' => ['chatThreads' => $threads]])->save();
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => [
            $this->change(['appState', 'chatThreads', 'one', '1', 'text'], 'B', 'C'),
        ]], $headers)->assertOk();
        $this->assertSame([['text' => 'A'], ['text' => 'C']], $user->fresh()->app_state['chatThreads']['one']);
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => [[
            'path' => ['appState', 'chatThreads', 'one'], 'beforePresent' => true,
            'before' => [['text' => 'A'], ['text' => 'C']], 'remove' => true,
        ]]], $headers)->assertOk();
        $this->assertSame(['two' => [['text' => 'Keep']]], $user->fresh()->app_state['chatThreads']);
    }

    public function test_delta_keeps_credentials_local_and_rejects_authority_fields(): void
    {
        [$user, $headers] = $this->fixture();
        $desktop = ['url' => 'http://fixture', 'pairCode' => 'ABC123', 'token' => 'never-store-this'];
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => [
            $this->change(['rememberedDesktops'], [], [$desktop]),
        ]], $headers)->assertOk();
        $this->assertArrayNotHasKey('token', $user->fresh()->remembered_desktops[0]);
        foreach ([['credits_balance'], ['appState', '__proto__']] as $path) {
            $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => [
                $this->change($path, null, 999999),
            ]], $headers)->assertStatus(422);
        }
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => []])->assertUnauthorized();
    }

    public function test_reordered_identical_messages_cannot_receive_another_messages_edit(): void
    {
        [$user, $headers] = $this->fixture();
        $threads = ['one' => [['id' => 'b', 'text' => 'Same'], ['id' => 'a', 'text' => 'Same']]];
        $user->forceFill(['app_state' => ['chatThreads' => $threads]])->save();
        $this->postJson('/api/session/state/delta', ['syncVersion' => 1, 'changes' => [
            $this->change(['appState', 'chatThreads', 'one', '0', 'id'], 'a', 'a'),
            $this->change(['appState', 'chatThreads', 'one', '0', 'text'], 'Same', 'Edited A'),
        ]], $headers)->assertStatus(409);
        $this->assertSame($threads, $user->fresh()->app_state['chatThreads']);
    }

    public function test_versioned_sync_preserves_exact_preimages_and_empty_strings(): void
    {
        [$user, $headers] = $this->fixture();
        $state = ['chatTitles' => ['one' => '  Code  '], 'profileImageUri' => ''];
        $this->postJson('/api/session/state', ['appState' => $state], $headers)->assertOk();
        $this->assertSame('Code', $user->fresh()->app_state['chatTitles']['one']);
        $this->postJson('/api/session/state', ['appState' => $state, 'responseMode' => 'ack-v1'], $headers)->assertOk();
        $this->assertSame('', $user->fresh()->app_state['profileImageUri']);
        $body = ['syncVersion' => 1, 'changes' => [
            $this->change(['appState', 'chatTitles', 'one'], '  Code  ', "\nUpdated\n"),
            $this->change(['appState', 'profileImageUri'], '', 'image'),
        ]];
        $this->postJson('/api/session/state/delta', $body, $headers)->assertOk();
        $this->postJson('/api/session/state/delta', $body, $headers)->assertOk();
        $this->assertSame("\nUpdated\n", $user->fresh()->app_state['chatTitles']['one']);
    }
}
