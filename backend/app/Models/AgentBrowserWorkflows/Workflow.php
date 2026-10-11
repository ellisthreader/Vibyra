<?php
namespace App\Models\AgentBrowserWorkflows;
use Illuminate\Database\Eloquent\{Model, Concerns\HasUuids};
final class Workflow extends Model
{
    use HasUuids;
    protected $table = 'agent_browser_workflows'; protected $guarded = [];
    protected function casts(): array
    {
        return ['steps' => 'encrypted:array', 'runtime_snapshot' => 'encrypted:array', 'grant_snapshot' => 'array', 'revision' => 'integer'];
    }
}
