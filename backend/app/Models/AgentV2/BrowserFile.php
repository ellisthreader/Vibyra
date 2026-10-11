<?php
namespace App\Models\AgentV2;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
final class BrowserFile extends Model
{
    use HasUuids;
    protected $table = 'agent_browser_files';
    protected $guarded = [];
    protected $hidden = ['content'];
    protected function casts(): array { return ['content' => 'encrypted', 'size' => 'integer']; }
}
