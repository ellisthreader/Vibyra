<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class Health
{
    public function status(): array
    {
        $enabled = (bool) config('model_catalog.enabled');
        if (! $enabled) return ['enabled' => false, 'healthy' => true];
        $row = DB::table('model_catalog_state')->where('id', 1)->first();
        $fresh = $row?->last_run_at && Carbon::parse($row->last_run_at)->gt(now()->subMinutes(30));
        $configured = (! config('model_catalog.validate') || (bool) config('model_catalog.probe_key'))
            && (! config('model_catalog.artwork') || (config('model_catalog.image_key') && config('model_catalog.image_model') && extension_loaded('gd')))
            && (! config('model_catalog.publish') || (config('model_catalog.signing_key') && extension_loaded('sodium')));
        return ['enabled' => true, 'healthy' => (bool) ($fresh && $configured),
            'revision' => $row?->revision, 'lastRun' => $row?->last_run_at];
    }
}
