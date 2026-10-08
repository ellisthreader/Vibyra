<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\DB;

final class PublishedCatalog
{
    private ?array $snapshot = null;
    private ?array $signed = null;
    private bool $loaded = false;

    public function envelope(): ?array
    {
        if (! config('model_catalog.enabled') || ! config('model_catalog.publish')) return null;
        if ($this->loaded) return $this->signed;
        $id = DB::table('model_catalog_state')->where('id', 1)->value('revision');
        $row = $id ? DB::table('model_catalog_revisions')->find($id) : null;
        $this->loaded = true;
        return $this->signed = $row ? ['keyId' => $row->key_id, 'payload' => $row->payload, 'signature' => $row->signature] : null;
    }

    public function models(): array
    {
        if ($this->snapshot !== null) return $this->snapshot;
        $envelope = $this->envelope();
        $data = $envelope ? json_decode($envelope['payload'], true, 64, JSON_THROW_ON_ERROR) : [];
        $rows = array_filter($data['models'] ?? [], fn ($row) => ! in_array($row['id'], $data['disabled'] ?? [], true));
        return $this->snapshot = array_column($rows, null, 'id');
    }

    public function eligible(string $id): bool
    {
        return isset($this->models()[$id]) && ! in_array($id, config('model_catalog.quarantined'), true);
    }

    public function active(): bool
    {
        return $this->envelope() !== null;
    }
}
