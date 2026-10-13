<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['reference', 'email', 'topic', 'details', 'status', 'closed_at'])]
class PublicRequest extends Model
{
    use MassPrunable;

    public const TOPICS = [
        'privacy_access', 'privacy_correction', 'privacy_deletion',
        'privacy_restriction', 'privacy_portability', 'privacy_objection',
        'waitlist_removal', 'refund', 'billing', 'community_report',
        'accessibility', 'security', 'support', 'other',
    ];

    public const STATUSES = ['new', 'reviewing', 'closed'];

    public function prunable(): Builder
    {
        return static::query()->where('status', 'closed')->where('closed_at', '<', now()->subYears(3));
    }

    protected function casts(): array
    {
        return ['closed_at' => 'datetime'];
    }
}
