<?php

namespace App\Services\Deployments\Concerns;

use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Str;

trait HandlesRailwayDeploymentState
{
    private function markStopped(PublishedProjectDeployment $deployment, string $message): PublishedProjectDeployment
    {
        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_STOPPED,
            'provider_status' => 'stopped',
            'public_url' => null,
            'last_error' => Str::limit($message, 900, ''),
        ])->save();

        return $deployment;
    }

    public function deleteProject(string $projectId): bool
    {
        $payload = $this->railwayGraphql(
            'mutation($id: String!) { projectDelete(id: $id) }',
            ['id' => $projectId],
        );

        return $payload !== null;
    }

    private function markFailed(PublishedProjectDeployment $deployment, string $message, string $logs): PublishedProjectDeployment
    {
        $logDetail = $this->providerOutputDetail($logs);
        if ($logDetail !== '' && str_contains(Str::lower($message), Str::lower($logDetail))) {
            $logs = '';
        }
        $deployment->forceFill([
            'status' => PublishedProjectDeployment::STATUS_FAILED,
            'provider_status' => 'failed',
            'last_error' => Str::limit($message, 900, ''),
            'latest_logs_summary' => Str::limit($logs, 1800, ''),
        ])->save();

        return $deployment;
    }

    private function projectName(PublishedProjectDeployment $deployment): string
    {
        $prefix = Str::slug((string) config('services.railway.runtime_project_prefix', 'vibyra-demo')) ?: 'vibyra-demo';

        return $prefix.'-'.$deployment->id;
    }

    private function decodeJsonPayload(string $output): mixed
    {
        $trimmed = trim($output);
        $decoded = json_decode($trimmed, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }
        foreach (array_reverse(preg_split('/\R/', $trimmed) ?: []) as $line) {
            $decoded = json_decode(trim($line), true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return $decoded;
            }
        }

        return $output;
    }

    private function firstServiceId(mixed $payload): ?string
    {
        return $this->walk($payload, function ($value, string $key, string $path) {
            if (! is_string($value)) {
                return null;
            }
            if ($key === 'serviceId' && str_contains($path, 'serviceInstances.edges')) {
                return $value;
            }
            if ($key === 'id' && str_contains($path, 'services.edges') && ! str_contains($path, 'latestDeployment')) {
                return $value;
            }

            return null;
        });
    }

    private function firstProjectId(mixed $payload): ?string
    {
        return $this->firstString($payload, ['id'], fn ($path) => $path === 'id' || $path === 'project.id');
    }

    private function firstServiceName(mixed $payload): ?string
    {
        return $this->firstString(
            $payload,
            ['serviceName', 'name'],
            fn ($path) => str_contains($path, 'services.edges') || str_contains($path, 'serviceInstances.edges')
        );
    }

    private function firstDeploymentId(mixed $payload): ?string
    {
        return $this->firstString(
            $payload,
            ['deploymentId', 'id'],
            fn ($path) => $path === 'deploymentId'
                || str_contains($path, 'latestDeployment')
                || str_contains($path, 'activeDeployments')
        );
    }

    private function firstRailwayUrl(mixed $payload): ?string
    {
        if (is_string($payload)) {
            if (preg_match('/https:\/\/[a-z0-9.-]+\.up\.railway\.app[^\s"\'<>]*/i', $payload, $match) === 1) {
                return $match[0];
            }
            if (preg_match('/\b([a-z0-9.-]+\.up\.railway\.app)\b/i', $payload, $match) === 1) {
                return 'https://'.$match[1];
            }

            return null;
        }

        return $this->walk($payload, fn ($value) => is_string($value) ? $this->firstRailwayUrl($value) : null);
    }

    private function firstString(mixed $payload, array $keys, ?callable $pathFilter = null): ?string
    {
        return $this->walk($payload, function ($value, string $key, string $path) use ($keys, $pathFilter) {
            if (! is_string($value) || ! in_array($key, $keys, true)) {
                return null;
            }
            if ($pathFilter && ! $pathFilter($path)) {
                return null;
            }

            return $value;
        });
    }

    private function walk(mixed $value, callable $callback, string $key = '', string $path = ''): mixed
    {
        $result = $callback($value, $key, $path);
        if ($result !== null) {
            return $result;
        }
        if (! is_array($value)) {
            return null;
        }
        foreach ($value as $childKey => $child) {
            $childPath = $path === '' ? (string) $childKey : $path.'.'.$childKey;
            $result = $this->walk($child, $callback, (string) $childKey, $childPath);
            if ($result !== null) {
                return $result;
            }
        }

        return null;
    }

    private function safeRelativePath(string $path): string
    {
        $path = trim(str_replace('\\', '/', $path), '/');
        $parts = array_values(array_filter(explode('/', $path), fn ($part) => $part !== '' && $part !== '.'));
        if ($parts === [] || in_array('..', $parts, true)) {
            return '';
        }

        return implode('/', $parts);
    }

    private function isSafePublicUrl(?string $url): bool
    {
        if (! $url || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return $scheme === 'https' && $host !== ''
            && ! preg_match('/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/i', $host);
    }
}
