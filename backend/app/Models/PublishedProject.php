<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'user_id',
    'source_project_id',
    'slug',
    'title',
    'description',
    'stack',
    'tags',
    'logo_image_url',
    'screenshot_urls',
    'preview_html',
    'visibility',
    'review_status',
    'review_flags',
    'review_reason',
    'reviewed_at',
    'likes_count',
    'comments_count',
    'published_at',
])]
class PublishedProject extends Model
{
    public const REVIEW_PENDING = 'pending';
    public const REVIEW_APPROVED = 'approved';
    public const REVIEW_DENIED = 'denied';
    public const REVIEW_UNDER_REVIEW = 'under_review';

    protected function casts(): array
    {
        return [
            'tags' => 'array',
            'screenshot_urls' => 'array',
            'review_flags' => 'array',
            'reviewed_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    public function isPubliclyVisible(): bool
    {
        return $this->visibility === 'public' && $this->review_status === self::REVIEW_APPROVED;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(PublishedProjectComment::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(PublishedProjectReaction::class);
    }
}
