<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'published_project_id',
    'reporter_user_id',
    'reason',
    'details',
    'screenshot_data_url',
    'status',
    'reviewed_at',
])]
#[Hidden(['screenshot_data_url'])]
class PublishedProjectReport extends Model
{
    public const REASONS = ['broken_app', 'unsafe_content', 'spam_or_scam', 'other'];
    public const STATUS_PENDING = 'pending';

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(PublishedProject::class, 'published_project_id');
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_user_id');
    }
}
