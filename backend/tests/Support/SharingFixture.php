<?php

namespace Tests\Support;

use App\Models\{User, VibyraSession};
use App\Services\Agents\Teammates;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Part 17 helpers: the three flags, a signed-in account, teammates, skills and finished runs without the whole Agent V2 runner. */
trait SharingFixture
{
    protected User $user;

    protected function bootSharing(array $flags = ['bundles', 'links', 'invite']): void
    {
        foreach ($flags as $flag) config(['sharing.'.$flag => true]);
        config(['platform.activity' => true, 'agents.enabled' => true, 'app.key' => 'base64:'.base64_encode(str_repeat('k', 32))]);
        $this->user = $this->signedIn();
    }

    /** A second account with its own session; the returned token is for `withToken`. */
    protected function signedIn(string $token = 'share-session'): User
    {
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Mac']);
        app(\App\Services\Vibes\Wallet::class)->ensure($user);
        $this->withToken($token);
        return $user;
    }

    protected function teammate(string $name = 'Reviewer', array $extra = [], ?User $user = null): array
    {
        return app(Teammates::class)->save(($user ?? $this->user)->id, ['id' => (string) Str::uuid(), 'name' => $name, 'brief' => 'Review pull requests.',
            'avatar' => 'review', 'budget' => 10, 'integrations' => [], ...$extra]);
    }

    protected function skill(string $name, string $text, array $teammates = [], ?User $user = null): array
    {
        return app(\App\Services\Agents\Skills::class)->save(($user ?? $this->user)->id, ['id' => (string) Str::uuid(), 'revision' => 0, 'name' => $name,
            'instructions' => $text, 'teammateIds' => $teammates]);
    }

    /** A finished run of a teammate, written straight to the table. */
    protected function finishedRun(array $agent, string $prompt, ?string $answer, string $state = 'completed', ?User $user = null): string
    {
        $id = (string) Str::uuid();
        $seq = 1 + (int) DB::table('agent_runs')->where('agent_id', $agent['id'])->max('conversation_seq');
        DB::table('agent_runs')->insert(['id' => $id, 'user_id' => ($user ?? $this->user)->id, 'agent_id' => $agent['id'], 'conversation_id' => $agent['chatId'],
            'conversation_seq' => $seq, 'idempotency_key' => 'k-'.$id, 'request_hash' => str_repeat('a', 64), 'prompt' => $prompt, 'attachments' => '[]',
            'profile_revision' => 1, 'grant_snapshot' => '[]', 'grant_hash' => str_repeat('b', 64), 'runtime_binding_id' => (string) Str::uuid(),
            'runtime_snapshot' => '[]', 'state' => $state, 'answer' => $answer, 'created_at' => now(), 'updated_at' => now()]);
        return $id;
    }

    /** A valid bundle to start from; tests change one thing at a time. */
    protected function bundle(array $over = []): array
    {
        return array_replace_recursive(['format' => 'vibyra.teammate', 'schemaVersion' => 1, 'teammate' => ['name' => 'Release helper', 'brief' => 'Keep releases tidy.', 'avatar' => 'lead'],
            'skills' => [['name' => 'Changelog', 'description' => 'Write a changelog.', 'instructions' => 'List what changed, newest first.']],
            'routines' => [['title' => 'Friday notes', 'prompt' => 'Draft the release notes.', 'timezone' => 'Europe/London', 'recurrence' => ['type' => 'weekly', 'weekdays' => [5], 'time' => '16:00']]],
            'triggers' => [['kind' => 'github.pull_request', 'filter' => ['actions' => ['opened']], 'promptTemplate' => 'A pull request opened.']],
            'connectionSlots' => ['github']], $over);
    }

    /** `array_replace_recursive` cannot drop a key or empty a list, so a test swaps a whole part with this. */
    protected function bundleWith(string $key, mixed $value): array
    {
        return [...$this->bundle(), $key => $value];
    }
}
