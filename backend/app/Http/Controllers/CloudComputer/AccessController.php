<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{AccessCapacity, AccessProjects, AccessProviders, SyncKeys, SyncProjects, Wake};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** What Vibyra Cloud may use (docs/cloud-access-contract.md): the phone's project ticks and the Codex login policy. */
final class AccessController extends Controller
{
    use UserPayloads, SyncGuards;

    public function show(Request $request)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        return $this->reply($user);
    }

    /** PUT /access/projects: `{projects:[{id|projectKey, name?, allowed}]}`. A denied project loses its cloud copy. */
    public function projects(Request $request, AccessProjects $access)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['projects' => 'required|array|min:1|max:'.AccessProjects::MAX_ITEMS,
            'projects.*' => 'required|array', 'projects.*.id' => 'required_without:projects.*.projectKey|string|min:1|max:255',
            'projects.*.projectKey' => ['required_without:projects.*.id', 'string', 'regex:'.SyncProjects::KEY],
            'projects.*.name' => 'sometimes|nullable|string|max:120', 'projects.*.allowed' => 'required|boolean']);
        $this->change($user, fn () => $access->decide($user, self::items($d['projects']), $request->input('source') === 'mac' ? 'mac' : 'phone'));
        app(Wake::class)->forPerson($user); // a project just ticked with no cloud copy yet starts Cloud for it
        return $this->reply($user);
    }

    /** PUT /access/providers/codex: `{carryOver?: allowed|blocked, enabled?: bool}` (at least one). Codex off also blocks carry-over. */
    public function codex(Request $request, AccessProviders $providers)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['carryOver' => 'required_without:enabled|string|in:'.implode(',', AccessProviders::CARRY_OVER),
            'enabled' => 'required_without:carryOver|boolean']);
        $this->change($user, function () use ($user, $providers, $d) {
            if (isset($d['carryOver'])) $providers->setCodex($user, $d['carryOver']);
            if (array_key_exists('enabled', $d)) $providers->setEnabled($user, 'codex', (bool) $d['enabled']);
        });
        return $this->reply($user);
    }

    /** PUT /access/providers/claude: `{enabled: bool}`. Off: the Cloud Host neither offers nor runs Claude. */
    public function claude(Request $request, AccessProviders $providers)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['enabled' => 'required|boolean']);
        $this->change($user, fn () => $providers->setEnabled($user, 'claude', (bool) $d['enabled']));
        return $this->reply($user);
    }

    /** PUT /access/integrations/github: `{enabled: bool}`. Off refuses every GitHub use for Vibyra Cloud. */
    public function github(Request $request, AccessProviders $providers)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $d = $this->valid($request->all(), ['enabled' => 'required|boolean']);
        $this->change($user, fn () => $providers->setEnabled($user, 'github', (bool) $d['enabled']));
        return $this->reply($user);
    }

    /** Validated request items to `{key, name, allowed}`; the key comes from the Mac project id when one is given. */
    public static function items(array $projects, ?bool $allowed = null): array
    {
        $out = [];
        foreach ($projects as $p) {
            $key = isset($p['id']) ? AccessProjects::key((string) $p['id']) : strtolower($p['projectKey']);
            $name = isset($p['name']) ? trim((string) $p['name']) : null;
            $out[$key] = ['key' => $key, 'name' => $name === '' ? null : $name, 'allowed' => $allowed ?? (bool) $p['allowed']];
        }
        return array_values($out);
    }

    private function change(int $user, callable $write): void
    {
        DB::transaction(function () use ($user, $write) {
            app(Wallet::class)->lock($user);
            $this->storing($user); // withdrawal or entitlement changes while this request waited win
            $write();
        }, 5);
    }

    private function reply(int $user)
    {
        return response()->json(['ok' => true, 'projects' => app(AccessProjects::class)->rows($user),
            'providers' => app(AccessProviders::class)->payload($user), 'integrations' => app(AccessProviders::class)->integrations($user), 'capacity' => app(AccessCapacity::class)->payload($user),
            // When each Mac last checked in, so the phone can say why a ticked project is still waiting.
            'macs' => app(SyncKeys::class)->seen($user),
            // The server starts Cloud itself for synced work (Wake::forSync): the phone never asks the person to wake it for that.
            'autoWake' => true])
            ->header('Cache-Control', 'private, no-store');
    }
}
