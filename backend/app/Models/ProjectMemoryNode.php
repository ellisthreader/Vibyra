<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'vault_id',
    'parent_id',
    'type',
    'name',
    'markdown_content',
    'source',
    'source_path',
    'position',
    'version',
])]
class ProjectMemoryNode extends Model
{
    use HasUlids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'version' => 'integer',
        ];
    }

    public function vault(): BelongsTo
    {
        return $this->belongsTo(ProjectMemoryVault::class, 'vault_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
