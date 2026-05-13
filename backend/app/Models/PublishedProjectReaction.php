<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'published_project_id',
    'user_id',
    'type',
])]
class PublishedProjectReaction extends Model
{
    public function project(): BelongsTo
    {
        return $this->belongsTo(PublishedProject::class, 'published_project_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
