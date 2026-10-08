<?php
namespace App\Services\CloudComputer;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/** The same reviewed project/account choices on the phone and desktop. Reading never stores anything. */
final readonly class ConnectSelections
{
    public function __construct(public array $projects, public array $accounts) {}

    public static function read(Request $request): self
    {
        $v = Validator::make($request->all(), [
            'projects' => 'sometimes|array|max:'.AccessProjects::MAX_ITEMS,
            'projects.*' => 'required|array:id,name', 'projects.*.id' => 'required|string|min:1|max:255|distinct:strict',
            'projects.*.name' => 'required|string|min:1|max:120',
            'accounts' => 'sometimes|array:claude,codex,github',
            'accounts.claude' => 'sometimes|boolean', 'accounts.codex' => 'sometimes|boolean', 'accounts.github' => 'sometimes|boolean',
        ]);
        if ($v->fails()) Computers::fail('invalid_request', (string) $v->errors()->first(), 422);
        $d = $v->validated();
        foreach ($d['projects'] ?? [] as $project) {
            if (trim($project['id']) === '' || trim($project['name']) === '') {
                Computers::fail('invalid_request', 'Give each selected project an id and a name.', 422);
            }
        }
        $projects = array_map(fn ($p) => ['key' => AccessProjects::key($p['id']), 'name' => trim($p['name']), 'allowed' => true], $d['projects'] ?? []);
        return new self($projects,
            array_map(fn ($v) => filter_var($v, FILTER_VALIDATE_BOOLEAN), $d['accounts'] ?? []));
    }

    public function apply(int $user, string $source): void
    {
        // Empty means no new grants; it must never become "all projects" or erase an existing choice.
        if ($this->projects) app(AccessProjects::class)->decide($user, $this->projects, $source);
        if ($this->accounts) app(AccessProviders::class)->apply($user, $this->accounts);
    }
}
