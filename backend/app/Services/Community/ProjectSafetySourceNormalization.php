<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetySourceNormalization
{
    private function normalizeSourceFiles(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $files = [];
        foreach (array_slice($value, 0, self::SOURCE_FILE_MAX_COUNT) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $path = Str::limit(trim((string) ($item['path'] ?? '')), 240, '');
            if ($path === '') {
                continue;
            }

            $files[] = [
                'path' => $path,
                'language' => Str::limit(trim((string) ($item['language'] ?? '')), 40, ''),
                'body' => Str::limit((string) ($item['body'] ?? ''), self::SOURCE_FILE_MAX_CHARACTERS, ''),
            ];
        }

        return $files;
    }

    private function scanSourceFiles(array $files, array $sourceReview, array &$findings): void
    {
        if ($files === []) {
            $findings[] = [
                'code' => 'source_snapshot_missing',
                'severity' => 'under_review',
                'target' => 'source',
                'message' => 'The project source snapshot was not available for automated review.',
                'scoreImpact' => $this->scoreImpact('source_snapshot_missing'),
            ];
            return;
        }

        if ((bool) ($sourceReview['truncated'] ?? false)) {
            $findings[] = [
                'code' => 'source_snapshot_truncated',
                'severity' => 'under_review',
                'target' => 'source',
                'message' => 'Only part of the project source could be reviewed automatically.',
                'scoreImpact' => $this->scoreImpact('source_snapshot_truncated'),
            ];
        }

        foreach ($files as $file) {
            $path = (string) $file['path'];
            $body = (string) $file['body'];

            $this->scanTextForSecrets($body, 'source_file', $findings);
            $this->scanSourcePath($path, $findings);
            $this->scanSourceBody($path, $body, $findings);
        }
    }

    private function scanSourcePath(string $path, array &$findings): void
    {
        $lower = strtolower($path);

        if (preg_match('/(^|\/)\.env(?:\.|$)/', $lower) === 1) {
            $findings[] = [
                'code' => 'env_source_file',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Environment files need human review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('env_source_file'),
            ];
        }

        if (preg_match('/\.(?:pem|key|p12|pfx)$/', $lower) === 1) {
            $findings[] = [
                'code' => 'credential_file',
                'severity' => 'deny',
                'target' => 'source_file',
                'message' => 'Published projects cannot include credential or key files.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('credential_file'),
            ];
        }
    }
}
