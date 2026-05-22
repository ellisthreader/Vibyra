<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'published_project_id',
    'user_id',
    'provider',
    'provider_project_id',
    'provider_service_id',
    'provider_deployment_id',
    'status',
    'provider_status',
    'hosting_mode',
    'demo_mode_enabled',
    'disabled_features',
    'stack',
    'build_command',
    'start_command',
    'public_url',
    'entry_path',
    'demo_html',
    'demo_files',
    'metadata',
    'last_error',
    'latest_logs_summary',
    'hosted_at',
])]
class PublishedProjectDeployment extends Model
{
    public const PROVIDER_STATIC = 'static';
    public const PROVIDER_RAILWAY = 'railway';

    public const MODE_STATIC = 'static';
    public const MODE_RAILWAY = 'railway';
    public const MODE_DEMO = 'demo';

    public const STATUS_QUEUED = 'queued';
    public const STATUS_UPLOADING = 'uploading';
    public const STATUS_BUILDING = 'building';
    public const STATUS_STARTING = 'starting';
    public const STATUS_LIVE = 'live';
    public const STATUS_STATIC_LIVE = 'static_live';
    public const STATUS_FAILED = 'failed';
    public const STATUS_STOPPED = 'stopped';

    public const SUCCESS_STATUSES = [
        self::STATUS_LIVE,
        self::STATUS_STATIC_LIVE,
    ];

    protected function casts(): array
    {
        return [
            'demo_mode_enabled' => 'boolean',
            'disabled_features' => 'array',
            'demo_files' => 'array',
            'metadata' => 'array',
            'hosted_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(PublishedProject::class, 'published_project_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isSuccessful(): bool
    {
        return in_array($this->status, self::SUCCESS_STATUSES, true);
    }
}
