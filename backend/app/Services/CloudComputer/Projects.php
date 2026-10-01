<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** The computer's project list and the clone queue the VM drains. */
class Projects
{
    public const NAME = '/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/';

    public function queue(object $w, string $name, ?string $repo, ?string $branch): array
    {
        return DB::transaction(function () use ($w, $name, $repo, $branch) {
            DB::table('cloud_workspaces')->where('id', $w->id)->lockForUpdate()->first();
            $old = DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->where('name', $name)->first();
            if ($old) {
                abort_unless($old->repo === $repo && $old->branch === $branch, 409, 'A project with this name already exists on your cloud computer.');
                // A failed clone may be asked for again (same name, repo and branch): it goes back in the queue.
                if ($old->state === 'failed') {
                    DB::table('cloud_computer_projects')->where('id', $old->id)->update(['state' => 'pending', 'error' => null, 'done_at' => null, 'updated_at' => now()]);
                }
                return $this->row($old);
            }
            abort_if(DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->count() >= 100, 422, 'Remove an unused cloud project first.');
            $id = (string) Str::uuid();
            DB::table('cloud_computer_projects')->insert(['id' => $id, 'workspace_id' => $w->id, 'name' => $name, 'repo' => $repo,
                'branch' => $branch, 'state' => 'pending', 'created_at' => now(), 'updated_at' => now()]);
            return $this->row(DB::table('cloud_computer_projects')->where('id', $id)->first());
        });
    }

    public function pending(object $w): array
    {
        return DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->where('state', 'pending')->orderBy('created_at')->limit(20)->get()
            ->map(fn ($p) => ['id' => $p->id] + $this->row($p))->all();
    }

    public function done(object $w, string $id, bool $ok, ?string $error): void
    {
        $p = DB::table('cloud_computer_projects')->where('id', $id)->where('workspace_id', $w->id)->first();
        abort_unless($p, 404, 'Unknown cloud project.');
        if ($p->state !== 'pending') return;
        DB::table('cloud_computer_projects')->where('id', $id)->update(['state' => $ok ? 'done' : 'failed',
            'error' => $ok ? null : mb_substr((string) $error, 0, 200), 'done_at' => now(), 'updated_at' => now()]);
    }

    /** Folders the Host reported, plus clones still waiting, by name. */
    public function listFor(object $w): array
    {
        $out = [];
        foreach (json_decode((string) $w->host_projects, true) ?: [] as $p) $out[$p['name']] = $this->row((object) $p);
        foreach (DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->whereIn('state', ['pending', 'done'])->orderBy('created_at')->get() as $p) {
            $out[$p->name] ??= $this->row($p);
        }
        return array_values($out);
    }

    /**
     * GitHub repos (lowercase owner/name) this computer may hold a credential for: clones the phone queued
     * (pending or done) plus origins the Host reported. The Host's list is self-reported by the VM.
     */
    public function repos(object $w): array
    {
        $out = [];
        $add = function ($repo) use (&$out) { if (is_string($repo) && preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $repo)) $out[strtolower($repo)] = true; };
        foreach (DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->whereIn('state', ['pending', 'done'])->pluck('repo') as $repo) $add($repo);
        foreach (json_decode((string) $w->host_projects, true) ?: [] as $p) $add(is_array($p) ? ($p['repo'] ?? null) : null);
        return array_keys($out);
    }

    public function report(object $w, array $projects): void
    {
        $clean = [];
        foreach (array_slice($projects, 0, 100) as $p) {
            if (!is_array($p) || !is_string($p['name'] ?? null) || !preg_match(self::NAME, $p['name'])) continue;
            $clean[] = ['name' => $p['name'], 'repo' => is_string($p['repo'] ?? null) ? mb_substr($p['repo'], 0, 200) : null,
                'branch' => is_string($p['branch'] ?? null) ? mb_substr($p['branch'], 0, 200) : null];
        }
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['host_projects' => json_encode($clean)]);
    }

    private function row(object $p): array
    {
        return ['name' => $p->name, 'repo' => $p->repo ?? null, 'branch' => $p->branch ?? null];
    }
}
