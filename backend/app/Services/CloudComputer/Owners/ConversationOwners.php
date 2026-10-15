<?php
namespace App\Services\CloudComputer\Owners;

use App\Services\CloudComputer\{Computers, ConnectConsent};
use App\Services\Vibes\Wallet;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Who writes a conversation, the PC or Vibyra Cloud (docs/cloud-switching-contract.md section 1). A missing row is `pc`
 * at generation 0. A change is a compare-and-set on `generation`: the caller names the generation it read, and a stale
 * caller gets the current row back instead of silently forking the conversation.
 */
class ConversationOwners
{
    public const TABLE = 'cloud_conversation_owners';
    /** Metadata rows per account; far beyond real use, it only bounds abuse. */
    public const MAX_PER_USER = 5000;
    public const LIST_LIMIT = 2000;
    /** After this many idle days a PC record loses its title; its generation tombstone stays until disconnect. */
    public const PC_RECORD_DAYS = 30;

    /** @return list<array> */
    public function list(int $user, ?string $project = null): array
    {
        $q = DB::table(self::TABLE)->where('user_id', $user);
        if ($project !== null) $q->where('project', $project);
        return $q->orderByDesc('updated_at')->orderByDesc('id')->limit(self::LIST_LIMIT)->get()->map(fn ($r) => $this->payload($r))->all();
    }

    public function payload(object $row): array
    {
        return ['provider' => $row->provider, 'id' => $row->agent_session_id, 'project' => $row->project, 'owner' => $row->owner,
            'generation' => (int) $row->generation, 'title' => $row->title, 'updatedAt' => $row->updated_at ? Carbon::parse($row->updated_at)->toIso8601String() : null];
    }

    /** What a conversation with no row looks like. */
    public function missing(string $provider, string $id, string $project): array
    {
        return ['provider' => $provider, 'id' => $id, 'project' => $project, 'owner' => 'pc', 'generation' => 0, 'title' => null, 'updatedAt' => null];
    }

    /**
     * @return array{0:bool,1:array} [applied, row]: when not applied the row is the current one (the caller was stale).
     * Moving to `cloud` re-checks the opt-in under the account lock `AccessProjects::decide` takes, so an untick either
     * lands first (refused here) or after this write (and then puts the row back to pc). An existing record belongs to
     * one project: another project's name cannot borrow its opt-in.
     */
    public function set(int $user, string $provider, string $id, string $project, string $to, int $generation, ?string $title): array
    {
        $key = ['user_id' => $user, 'provider' => $provider, 'agent_session_id' => $id];
        try {
            return DB::transaction(function () use ($key, $user, $provider, $id, $project, $to, $generation, $title) {
                // Same lock/order as agreement withdrawal and connect: never recreate metadata after its purge.
                app(Wallet::class)->lock($user);
                if (!app(ConnectConsent::class)->connected($user)) {
                    Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
                }
                DB::table('users')->where('id', $user)->lockForUpdate()->first();
                if ($to === 'cloud') {
                    if (!app(OwnerProjects::class)->allowed($user, $project)) {
                        Computers::fail('project_not_allowed', 'This project is not chosen for Vibyra Cloud. Tick it on your iPhone first.', 409);
                    }
                }
                $row = DB::table(self::TABLE)->where($key)->lockForUpdate()->first();
                $current = $row ? (int) $row->generation : 0;
                if ($current !== $generation) return [false, $row ? $this->payload($row) : $this->missing($provider, $id, $project)];
                if ($row && $row->project !== $project) {
                    Computers::fail('project_mismatch', 'This conversation belongs to another project.', 409, ['current' => $this->payload($row)]);
                }
                $values = ['project' => $project, 'owner' => $to, 'generation' => $current + 1, 'updated_at' => now()];
                if ($title !== null) $values['title'] = $title;
                if ($row) {
                    // The generation in the WHERE keeps a second writer from overwriting a row it did not read.
                    if (DB::table(self::TABLE)->where('id', $row->id)->where('generation', $current)->update($values) !== 1) {
                        return [false, $this->payload(DB::table(self::TABLE)->where('id', $row->id)->first())];
                    }
                } else {
                    if (DB::table(self::TABLE)->where('user_id', $user)->count() >= self::MAX_PER_USER) {
                        Computers::fail('too_many_conversations', 'Too many conversations are recorded for this account.', 422);
                    }
                    DB::table(self::TABLE)->insert($key + $values + ['created_at' => now()]);
                }
                return [true, $this->payload(DB::table(self::TABLE)->where($key)->first())];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            // A concurrent first move for the same conversation won the unique slot.
            return [false, $this->payload(DB::table(self::TABLE)->where($key)->first())];
        }
    }

    /** "Disconnect Vibyra Cloud": every owner record goes with the rest of the account's cloud data. */
    public function purge(int $user): void
    {
        DB::table(self::TABLE)->where('user_id', $user)->delete();
    }

    /**
     * Projects that left Vibyra Cloud: their conversations are on the PC again (no row = pc). A row that was in Cloud
     * stays as a plain PC record with its counter bumped and its title forgotten, never deleted: the generation must not
     * restart at 0, or a stale holder of generation N could win a compare-and-set against a later row that reached N
     * again (ABA). Disconnect and account deletion (`purge`) still delete everything.
     */
    public function dropForProjects(int $user, array $names): void
    {
        $names = array_values(array_unique(array_filter($names, 'is_string')));
        if (!$names) return;
        DB::table(self::TABLE)->where('user_id', $user)->where('owner', 'cloud')->whereIn('project', $names)
            ->update(['owner' => 'pc', 'generation' => DB::raw('generation + 1'), 'title' => null, 'updated_at' => now()]);
    }

    /** Hourly: forget idle PC titles, retaining generation tombstones so stale writers cannot win after an ABA reset. */
    public function sweep(): int
    {
        $total = 0;
        do {
            $cutoff = now()->subDays(self::PC_RECORD_DAYS);
            $ids = DB::table(self::TABLE)->where('owner', 'pc')->whereNotNull('title')->where('updated_at', '<', $cutoff)->orderBy('id')->limit(1000)->pluck('id')->all();
            // Recheck after selecting: a concurrent move or fresh title must survive the sweep.
            if ($ids) $total += DB::table(self::TABLE)->whereIn('id', $ids)->where('owner', 'pc')->where('updated_at', '<', $cutoff)
                ->whereNotNull('title')->update(['title' => null]);
        } while (count($ids) === 1000);
        return $total;
    }
}
