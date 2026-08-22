<?php

namespace App\Services\Deployments;

use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\Storage;
use JsonException;
use RuntimeException;
use Throwable;

class DeploymentArtifactStore
{
    public function persist(PublishedProjectDeployment $deployment): bool
    {
        $mode = $this->mode();
        if ($mode === 'database' || ! $deployment->exists) {
            return true;
        }

        try {
            $payload = json_encode([
                'version' => 1,
                'demoHtml' => $deployment->demo_html,
                'demoFiles' => $deployment->demo_files,
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            $disk = (string) config('deployment_artifacts.disk');
            $path = $this->path($deployment);

            if (! Storage::disk($disk)->put($path, $payload)) {
                throw new RuntimeException('Deployment artifact storage rejected the write.');
            }

            $deployment->forceFill([
                'artifact_disk' => $disk,
                'artifact_path' => $path,
                'artifact_sha256' => hash('sha256', $payload),
                'artifact_bytes' => strlen($payload),
                'artifact_stored_at' => now(),
            ]);
            if ($mode === 'object') {
                $deployment->demo_html = null;
                $deployment->demo_files = null;
            }
            $deployment->saveQuietly();

            return true;
        } catch (Throwable $error) {
            if ($mode === 'object') {
                throw $error;
            }
            report($error);

            return false;
        }
    }

    public function hydrate(PublishedProjectDeployment $deployment): PublishedProjectDeployment
    {
        if (filled($deployment->demo_html) || ! empty($deployment->demo_files) || ! $deployment->artifact_path) {
            return $deployment;
        }

        $payload = Storage::disk($deployment->artifact_disk ?: config('deployment_artifacts.disk'))
            ->get($deployment->artifact_path);
        if ($deployment->artifact_sha256 && ! hash_equals($deployment->artifact_sha256, hash('sha256', $payload))) {
            throw new RuntimeException('Deployment artifact checksum validation failed.');
        }

        try {
            $decoded = json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('Deployment artifact JSON is invalid.', previous: $error);
        }
        if (($decoded['version'] ?? null) !== 1) {
            throw new RuntimeException('Deployment artifact format is unsupported.');
        }

        return $deployment->forceFill([
            'demo_html' => $decoded['demoHtml'] ?? null,
            'demo_files' => $decoded['demoFiles'] ?? null,
        ]);
    }

    public function files(PublishedProjectDeployment $deployment): array
    {
        $files = $this->hydrate($deployment)->demo_files;

        return is_array($files) ? $files : [];
    }

    public function html(PublishedProjectDeployment $deployment): ?string
    {
        $html = $this->hydrate($deployment)->demo_html;

        return filled($html) ? (string) $html : null;
    }

    public function available(PublishedProjectDeployment $deployment): bool
    {
        return $deployment->hasInlineArtifact() || filled($deployment->artifact_path);
    }

    private function mode(): string
    {
        $mode = (string) config('deployment_artifacts.mode', 'database');

        return in_array($mode, ['database', 'dual', 'object'], true) ? $mode : 'database';
    }

    private function path(PublishedProjectDeployment $deployment): string
    {
        $prefix = trim((string) config('deployment_artifacts.prefix'), '/');

        return ($prefix !== '' ? $prefix.'/' : '')
            .$deployment->published_project_id.'/'.$deployment->id.'.json';
    }
}
