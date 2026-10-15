<?php

namespace App\Services\Privacy;

use App\Models\User;
use App\Services\Membership\Units;
use App\Services\PromptLibrary\PromptLibrary;
use Generator;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * What the "Download my data" archive holds, one JSON file per entry. Every table is read through a named column list (never
 * `select *`), only the account's own rows, and only fields a person would recognise as theirs: no credentials, tokens, hashes,
 * provider or billing identifiers, device keys, or anything about other people. List sections are generators bounded by
 * `reliability.export.max_rows`; `$cut` says whether the section just read was cut short.
 */
final class ExportSections
{
    /** Set while a list section is read when more rows existed than the cap; the builder reads and clears it. */
    public bool $cut = false;

    public function __construct(private readonly int $max = 20000) {}

    /** @return array<string, array|Generator> archive file name => data */
    public function for(User $user): array
    {
        $id = (int) $user->getKey();
        return ['account.json' => $this->account($user), 'settings.json' => $this->settings($user),
            'chats.json' => $this->chats($id), 'projects.json' => $this->projects($id), 'teammates.json' => $this->teammates($id),
            'activity.json' => $this->activity($id), 'spend-caps.json' => $this->spendCaps($id), 'prompt-library.json' => $this->prompts($user)];
    }

    private function account(User $user): array
    {
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'emailVerifiedAt' => $this->iso($user->email_verified_at),
            'signInMethod' => $user->provider ?: 'email', 'plan' => $user->plan, 'planBillingCycle' => $user->plan_billing_cycle,
            'membershipEndsAt' => $this->iso($user->membership_ends_at), 'level' => $user->level, 'createdAt' => $this->iso($user->created_at)];
    }

    private function settings(User $user): array
    {
        $id = (int) $user->getKey();
        $state = is_array($user->app_state) ? $user->app_state : [];
        unset($state['promptLibrary']);
        $notify = DB::table('notification_preferences')->where('user_id', $id)->first(['attention', 'replies', 'smart', 'advisories',
            'timezone', 'quiet_start', 'quiet_end', 'spend']);
        $assistant = DB::table('vibes_preferences')->where('user_id', $id)->first(['style', 'instructions', 'memory_enabled']);
        return ['onboardingComplete' => (bool) $user->onboarding_complete, 'appState' => ExportScrub::clean($state),
            'notifications' => $notify ? (array) $notify : null,
            'assistantPreferences' => $assistant ? ExportScrub::clean((array) $assistant) : null,
            'memories' => DB::table('vibes_memories')->where('user_id', $id)->orderBy('created_at')->limit($this->max)->get(['text', 'created_at'])
                ->map(fn ($m) => ['text' => ExportScrub::text($m->text), 'createdAt' => $this->iso($m->created_at)])->all(),
            'journalRetentionDays' => DB::table('account_privacy_settings')->where('user_id', $id)->value('journal_retention_days')];
    }

    private function chats(int $id): Generator
    {
        $chats = DB::table('vibes_chats')->where('user_id', $id)->orderByDesc('updated_at')->limit($this->max + 1)->get(['id', 'title', 'agent_id',
            'project_id', 'created_at', 'updated_at']);
        foreach ($chats->take($this->max) as $chat) {
            yield ['id' => $chat->id, 'title' => ExportScrub::text($chat->title), 'teammateId' => $chat->agent_id, 'projectId' => $chat->project_id,
                'createdAt' => $this->iso($chat->created_at), 'updatedAt' => $this->iso($chat->updated_at),
                'turns' => DB::table('vibes_turns')->where('user_id', $id)->where('chat_id', $chat->id)->orderBy('created_at')->limit($this->max)
                    ->get(['id', 'model', 'status', 'prompt', 'response', 'created_at', 'settled_at'])->map(fn ($t) => [
                        'id' => $t->id, 'model' => $t->model, 'status' => $t->status, 'prompt' => ExportScrub::text($t->prompt),
                        'response' => ExportScrub::text($t->response), 'createdAt' => $this->iso($t->created_at), 'settledAt' => $this->iso($t->settled_at)])->all()];
        }
        $this->cut = $chats->count() > $this->max;
    }

    private function projects(int $id): Generator
    {
        yield from $this->capped(DB::table('cloud_sync_projects')->where('user_id', $id)->orderBy('id'), fn ($p) => ['kind' => 'cloud-sync',
            'name' => $p->name, 'state' => $p->state, 'createdAt' => $this->iso($p->created_at), 'lastSyncedAt' => $this->iso($p->up_synced_at),
            'removedAt' => $this->iso($p->removed_at)], ['name', 'state', 'created_at', 'up_synced_at', 'removed_at']);
        // Who writes each conversation, PC or Vibyra Cloud (docs/cloud-switching-contract.md): metadata only, no messages.
        yield from $this->capped(DB::table('cloud_conversation_owners')->where('user_id', $id)->orderBy('id'), fn ($o) => ['kind' => 'cloud-conversation-owner',
            'provider' => $o->provider, 'project' => $o->project, 'owner' => $o->owner, 'title' => ExportScrub::text($o->title),
            'updatedAt' => $this->iso($o->updated_at)], ['provider', 'project', 'owner', 'title', 'updated_at']);
        // The Cloud Host's phase reports (seven days, capped): provider, project, phase, title and time; never the conversation id.
        yield from $this->capped(DB::table('cloud_host_events')->where('user_id', $id)->orderBy('id'), fn ($e) => ['kind' => 'cloud-host-event',
            'provider' => $e->provider, 'project' => $e->project, 'phase' => $e->phase, 'title' => ExportScrub::text($e->title),
            'at' => $this->iso($e->at)], ['provider', 'project', 'phase', 'title', 'at']);
        yield from $this->capped(DB::table('published_projects')->where('user_id', $id)->orderBy('id'), fn ($p) => ['kind' => 'published',
            'title' => ExportScrub::text($p->title), 'slug' => $p->slug, 'description' => ExportScrub::text($p->description), 'stack' => $p->stack,
            'tags' => json_decode((string) $p->tags, true) ?: [], 'visibility' => $p->visibility, 'publishedAt' => $this->iso($p->published_at),
            'createdAt' => $this->iso($p->created_at)], ['title', 'slug', 'description', 'stack', 'tags', 'visibility', 'published_at', 'created_at']);
    }

    private function teammates(int $id): array
    {
        $skills = DB::table('agent_skills')->where('user_id', $id)->orderBy('created_at')->limit($this->max)->get(['id', 'name', 'instructions', 'created_at']);
        $assigned = DB::table('agent_skill_assignments')->whereIn('skill_id', $skills->pluck('id'))->get(['agent_id', 'skill_id'])->groupBy('agent_id');
        return ['teammates' => DB::table('agent_teammates')->where('user_id', $id)->orderBy('created_at')->limit($this->max)
            ->get(['id', 'name', 'avatar', 'brief', 'memory', 'model', 'budget', 'archived_at', 'created_at'])->map(fn ($t) => [
                'id' => $t->id, 'name' => $t->name, 'avatar' => $t->avatar, 'brief' => ExportScrub::text($t->brief), 'memory' => ExportScrub::text($t->memory),
                'model' => $t->model, 'budget' => (int) $t->budget, 'archivedAt' => $this->iso($t->archived_at), 'createdAt' => $this->iso($t->created_at),
                'skillIds' => ($assigned[$t->id] ?? collect())->pluck('skill_id')->values()->all()])->all(),
            'skills' => $skills->map(fn ($s) => ['id' => $s->id, 'name' => ExportScrub::text($s->name),
                'instructions' => ExportScrub::text($s->instructions), 'createdAt' => $this->iso($s->created_at)])->all()];
    }

    private function activity(int $id): Generator
    {
        yield from $this->capped(DB::table('account_audit_events')->where('user_id', $id)->orderByDesc('id'), fn ($e) => [
            'event' => $e->event, 'actor' => $e->actor, 'detail' => ExportScrub::clean(json_decode((string) $e->detail, true) ?: []),
            'ipAddress' => $e->ip_address, 'createdAt' => $this->iso($e->created_at)], ['event', 'actor', 'detail', 'ip_address', 'created_at']);
    }

    private function spendCaps(int $id): array
    {
        $w = DB::table('vibes_wallets')->where('user_id', $id)->first(['cap_day_units', 'cap_month_units', 'cap_run_units', 'cap_timezone', 'cloud_hours_overage']);
        $tokens = fn ($u) => $u === null ? null : round((int) $u / Units::SCALE, 4);
        return ['unit' => 'tokens', 'perDay' => $tokens($w->cap_day_units ?? null), 'perMonth' => $tokens($w->cap_month_units ?? null),
            'perRun' => $tokens($w->cap_run_units ?? null), 'timezone' => $w->cap_timezone ?? null, 'cloudHoursOverage' => $w->cloud_hours_overage ?? null];
    }

    private function prompts(User $user): array
    {
        $prompts = collect(app(PromptLibrary::class)->normalize($user->app_state['promptLibrary']['prompts'] ?? []))
            ->reject(fn ($p) => isset($p['deletedAt']))->map(fn ($p) => ['id' => $p['id'], 'title' => ExportScrub::text($p['title']),
                'text' => ExportScrub::text($p['text']), 'updatedAt' => $p['updatedAt']])->values()->all();
        return ['prompts' => $prompts];
    }

    /** @param list<string> $columns */
    private function capped(Builder $query, callable $map, array $columns): Generator
    {
        $n = 0;
        foreach ($query->limit($this->max + 1)->select($columns)->cursor() as $row) {
            if (++$n > $this->max) { $this->cut = true; return; }
            yield $map($row);
        }
    }

    private function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        try { return \Illuminate\Support\Carbon::parse($value)->toIso8601String(); } catch (\Throwable) { return null; }
    }
}
