<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

trait ChatLearningMemory
{
    private function chatLearningContext(User $user, Request $request, string $prompt, string $mode): string
    {
        try {
            $projectName = (string) $request->input('project', '');
            $projectKey = $this->chatLearningProjectKey($projectName);
            $tokens = $this->chatLearningTokens($prompt.' '.$projectName.' '.$request->input('filePath', ''));
            if ($tokens === []) {
                return '';
            }
            $queryTags = $this->chatLearningQueryTags($prompt, $mode, $request);
            $query = DB::table('chat_learning_memories')
                ->where('user_id', $user->id)
                ->where(function ($where) use ($projectKey) {
                    if ($projectKey === null) {
                        $where->whereNull('project_key');
                    } else {
                        $where->where('project_key', $projectKey);
                    }
                })
                ->whereIn('mode', array_values(array_unique([$mode, 'chat', 'build'])))
                ->latest()
                ->limit(100)
                ->get();

            $matches = $query
                ->map(fn ($row) => $this->chatLearningRankMemory($row, $tokens, $queryTags, $projectKey, $mode))
                ->filter(fn ($item) => ! $item['suppressed'] && $item['overlap'] >= 2 && $item['score'] >= 3.5)
                ->sortByDesc('score')
                ->take(3)
                ->values();

            if ($matches->isEmpty()) {
                return '';
            }

            $lines = ['Relevant past Vibyra learning:', 'These are optional suggestions; ignore any stale or conflicting detail.'];
            foreach ($matches as $item) {
                $row = $item['row'];
                $meta = $this->chatLearningMemoryMeta($row, $item, $projectKey, $mode);
                $lines[] = '- '.($meta !== '' ? $meta : 'Past memory');
                $lines[] = '  Prior: '.Str::limit($this->singleLine((string) ($this->chatLearningRowValue($row, 'prompt') ?? '')), 150, '');
                $lines[] = '  Suggested outcome: '.Str::limit($this->singleLine((string) ($this->chatLearningRowValue($row, 'response_summary') ?? '')), 230, '');
            }
            $lines[] = 'Memory rule: these are suggestions only, not verified facts; use only when directly relevant to the current project and request.';

            return Str::limit(implode("\n", $lines), 1200, '');
        } catch (Throwable) {
            return '';
        }
    }

    private function rememberChatLearningOutcome(
        User $user,
        Request $request,
        string $prompt,
        string $reply,
        ?array $app,
        string $modelKey,
        string $mode,
        string $reference
    ): void {
        if (! $this->shouldRememberChatLearning($request, $prompt, $reply, $app, $mode)) {
            return;
        }

        try {
            $projectName = trim((string) $request->input('project', ''));
            $skillId = trim((string) $request->input('skill', ''));
            $tags = $this->chatLearningTags($prompt, $mode, $app, $request);
            $payload = [
                'user_id' => $user->id,
                'project_key' => $this->chatLearningProjectKey($projectName),
                'project_name' => $projectName !== '' ? Str::limit($this->chatLearningRedact($projectName), 255, '') : null,
                'mode' => $mode,
                'model_key' => Str::limit($modelKey, 80, ''),
                'skill_id' => $skillId !== '' ? Str::limit($skillId, 80, '') : null,
                'score' => $app !== null || $mode === 'build' ? 3 : 2,
                'prompt' => Str::limit($this->chatLearningRedact($prompt), 1600, ''),
                'response_summary' => Str::limit($this->chatLearningRedact($this->singleLine($reply)), 900, ''),
                'tags' => json_encode($tags, JSON_UNESCAPED_SLASHES),
                'reference' => $reference,
                'created_at' => now(),
                'updated_at' => now(),
            ];
            $columns = $this->chatLearningMemoryColumns();
            if (in_array('outcome_status', $columns, true)) {
                $payload['outcome_status'] = 'unverified';
            }
            if (in_array('context_summary', $columns, true)) {
                $payload['context_summary'] = $this->chatLearningContextSummary($request, $tags);
            }
            if (in_array('error_signature', $columns, true)) {
                $payload['error_signature'] = $this->chatLearningErrorSignature($prompt.' '.$reply);
            }
            if (in_array('file_paths', $columns, true)) {
                $payload['file_paths'] = json_encode($this->chatLearningFilePaths($request), JSON_UNESCAPED_SLASHES);
            }
            if (in_array('metadata', $columns, true)) {
                $payload['metadata'] = json_encode([
                    'has_app' => $app !== null,
                    'prompt_chars' => mb_strlen($prompt),
                    'reply_chars' => mb_strlen($reply),
                    'stored_redacted' => true,
                ], JSON_UNESCAPED_SLASHES);
            }
            if ($columns !== []) {
                $payload = array_intersect_key($payload, array_flip($columns));
            }
            DB::table('chat_learning_memories')->insert($payload);
        } catch (Throwable) {
            // Chat quality memory must never break the user-facing answer.
        }
    }

    private function shouldRememberChatLearning(Request $request, string $prompt, string $reply, ?array $app, string $mode): bool
    {
        if ($request->boolean('disableLearning') || $request->boolean('learningDisabled')) {
            return false;
        }
        if ($request->has('learningEnabled') && ! $request->boolean('learningEnabled')) {
            return false;
        }
        if ($app !== null || $mode === 'build') {
            return true;
        }
        $signal = Str::lower($prompt.' '.$reply);
        if (preg_match('/\b(error|exception|crash|blank|failed|failing|bug|fix|debug|preview|build|broken|issue)\b/', $signal) === 1) {
            return true;
        }
        return trim((string) $request->input('filePath', '')) !== ''
            || count((array) $request->input('projectFiles', [])) > 0;
    }

    private function chatLearningRankMemory(object $row, array $tokens, array $queryTags, ?string $projectKey, string $mode): array
    {
        $tags = $this->chatLearningDecodeTags($this->chatLearningRowValue($row, 'tags'));
        $prompt = (string) ($this->chatLearningRowValue($row, 'prompt') ?? '');
        $summary = (string) ($this->chatLearningRowValue($row, 'response_summary') ?? '');
        $extra = (string) ($this->chatLearningRowValue($row, 'context_summary') ?? '').' '
            .(string) ($this->chatLearningRowValue($row, 'error_signature') ?? '').' '
            .(string) ($this->chatLearningRowValue($row, 'file_paths') ?? '');
        $overlap = $this->chatLearningOverlap($tokens, $this->chatLearningTokens($prompt.' '.$summary.' '.$extra.' '.implode(' ', $tags)));
        $tagOverlap = $this->chatLearningOverlap($queryTags, $tags);
        $negativePenalty = $this->chatLearningNegativePenalty($row, $tags);
        $recencySource = $this->chatLearningRowValue($row, 'feedback_at')
            ?? $this->chatLearningRowValue($row, 'updated_at')
            ?? $this->chatLearningRowValue($row, 'created_at');
        $score = ($overlap * 1.8)
            + $this->chatLearningProjectFit($projectKey, $this->chatLearningRowValue($row, 'project_key'))
            + $this->chatLearningModeFit($mode, (string) ($this->chatLearningRowValue($row, 'mode') ?? ''))
            + $this->chatLearningStoredScore($row)
            + $this->chatLearningRecencyScore($recencySource)
            + min(2.0, $tagOverlap * 0.7)
            + $this->chatLearningFeedbackTagScore($tags)
            + $negativePenalty;

        return [
            'row' => $row,
            'score' => $score,
            'overlap' => $overlap,
            'tag_overlap' => $tagOverlap,
            'tags' => $tags,
            'suppressed' => $negativePenalty <= -50.0,
        ];
    }

    private function chatLearningOverlap(array $left, array $right): int
    {
        if ($left === [] || $right === []) {
            return 0;
        }
        $right = array_flip($right);
        $overlap = 0;
        foreach ($left as $value) {
            if (isset($right[$value])) {
                $overlap++;
            }
        }
        return $overlap;
    }

    private function chatLearningTokens(string $value): array
    {
        $stop = array_flip(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'can', 'please', 'what', 'when', 'where', 'how', 'why', 'make', 'give']);
        $words = preg_split('/[^a-z0-9_#.-]+/i', Str::lower($value)) ?: [];
        $tokens = [];
        foreach ($words as $word) {
            $word = trim($word, '.-_#');
            if (strlen($word) < 3 || isset($stop[$word])) {
                continue;
            }
            $tokens[$word] = true;
        }
        return array_keys($tokens);
    }

    private function chatLearningTags(string $prompt, string $mode, ?array $app, ?Request $request = null): array
    {
        $tags = $this->chatLearningSemanticTags($prompt.' '.($request?->input('filePath', '') ?? ''), $mode);
        foreach (['php', 'tsx', 'ts', 'js', 'css', 'blade'] as $extension) {
            if ($request !== null && str_ends_with(Str::lower((string) $request->input('filePath', '')), '.'.$extension)) {
                $tags[] = $extension;
            }
        }
        if ($request !== null && trim((string) $request->input('skill', '')) !== '') {
            $tags[] = 'skill:'.Str::limit(Str::slug((string) $request->input('skill')), 40, '');
        }
        if ($request !== null && count((array) $request->input('projectFiles', [])) > 0) {
            $tags[] = 'project-files';
        }
        if ($app !== null) {
            $tags[] = 'app';
        }
        return array_values(array_unique($tags));
    }

    private function chatLearningQueryTags(string $prompt, string $mode, Request $request): array
    {
        return $this->chatLearningTags($prompt, $mode, null, $request);
    }

    private function chatLearningSemanticTags(string $value, string $mode): array
    {
        $tags = [$mode];
        $lower = Str::lower($value);
        foreach (['error', 'fix', 'debug', 'preview', 'build', 'crash', 'stream', 'auth', 'billing', 'sync', 'desktop', 'pairing', 'route', 'database', 'migration', 'style', 'theme', 'color', 'ui'] as $tag) {
            if (str_contains($lower, $tag)) {
                $tags[] = $tag;
            }
        }
        return array_values(array_unique($tags));
    }

    private function chatLearningDecodeTags($value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : $value;
        if (! is_array($decoded)) {
            return [];
        }
        $tags = [];
        foreach ($decoded as $tag) {
            $tag = trim(Str::lower((string) $tag));
            if ($tag !== '') {
                $tags[] = $tag;
            }
        }
        return array_values(array_unique($tags));
    }

    private function chatLearningProjectFit(?string $projectKey, $memoryProjectKey): float
    {
        $memoryProjectKey = is_string($memoryProjectKey) && $memoryProjectKey !== '' ? $memoryProjectKey : null;
        if ($projectKey === null) {
            return $memoryProjectKey === null ? 1.0 : -0.8;
        }
        if ($memoryProjectKey === $projectKey) {
            return 2.4;
        }
        return $memoryProjectKey === null ? 0.6 : -2.0;
    }

    private function chatLearningModeFit(string $mode, string $memoryMode): float
    {
        if ($memoryMode === $mode) {
            return 1.4;
        }
        if ($memoryMode === 'chat') {
            return 0.2;
        }
        return -0.6;
    }

    private function chatLearningStoredScore(object $row): float
    {
        $score = $this->chatLearningNumeric($this->chatLearningRowValue($row, 'score'));
        $feedback = $this->chatLearningNumeric($this->chatLearningRowValue($row, 'feedback_score'));
        $value = $score === null ? 0.0 : min(1.5, max(0.0, ($score - 1.0) * 0.5));
        if ($feedback !== null) {
            $value += $feedback >= 0 ? min(2.0, $feedback) : max(-8.0, $feedback * 2.0);
        }
        return $value;
    }

    private function chatLearningFeedbackTagScore(array $tags): float
    {
        if (array_intersect($tags, ['feedback:worked', 'feedback:positive'])) {
            return 1.0;
        }
        if (in_array('feedback:helpful', $tags, true)) {
            return 0.7;
        }
        return 0.0;
    }

    private function chatLearningRecencyScore($createdAt): float
    {
        $time = is_string($createdAt) ? strtotime($createdAt) : (is_object($createdAt) && method_exists($createdAt, 'getTimestamp') ? $createdAt->getTimestamp() : false);
        if ($time === false) {
            return 0.0;
        }
        $days = max(0.0, (time() - $time) / 86400);
        return match (true) {
            $days <= 2 => 1.2,
            $days <= 14 => 0.9,
            $days <= 45 => 0.5,
            $days <= 120 => 0.2,
            default => 0.0,
        };
    }

    private function chatLearningNegativePenalty(object $row, array $tags): float
    {
        foreach (['failed', 'is_failed', 'negative', 'is_negative', 'marked_failed', 'marked_negative'] as $column) {
            if (property_exists($row, $column) && $this->chatLearningTruthy($row->{$column})) {
                return -100.0;
            }
        }
        foreach (['status', 'outcome', 'outcome_status', 'feedback', 'verdict'] as $column) {
            $value = $this->chatLearningRowValue($row, $column);
            if (is_string($value) && in_array(Str::lower(trim($value)), ['failed', 'failure', 'negative', 'bad', 'incorrect', 'rejected', 'not_useful', 'not_helpful', 'did_not_work', 'thumbs_down'], true)) {
                return -100.0;
            }
        }
        if (array_intersect($tags, ['failed', 'failure', 'failed-memory', 'negative', 'negative-memory', 'not-useful', 'not_useful', 'thumbs_down', 'feedback:negative', 'feedback:not_helpful', 'feedback:did_not_work'])) {
            return -100.0;
        }
        return 0.0;
    }

    private function chatLearningTruthy($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (float) $value > 0;
        }
        return in_array(Str::lower(trim((string) $value)), ['1', 'true', 'yes', 'y', 'failed', 'failure', 'negative', 'bad', 'rejected', 'incorrect', 'not_useful', 'not_helpful', 'did_not_work', 'thumbs_down'], true);
    }

    private function chatLearningNumeric($value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    private function chatLearningMemoryMeta(object $row, array $item, ?string $projectKey, string $mode): string
    {
        $parts = [];
        $rowMode = (string) ($this->chatLearningRowValue($row, 'mode') ?? '');
        if ($rowMode !== '') {
            $parts[] = $rowMode === $mode ? $rowMode.' mode' : $rowMode.' mode memory';
        }
        $rowProjectKey = $this->chatLearningRowValue($row, 'project_key');
        $rowProjectKey = is_string($rowProjectKey) && $rowProjectKey !== '' ? $rowProjectKey : null;
        $parts[] = $projectKey !== null && $rowProjectKey === $projectKey ? 'same project' : ($rowProjectKey === null ? 'general' : 'different project');
        $tags = array_slice(array_diff($item['tags'], ['chat', 'build']), 0, 4);
        if ($tags !== []) {
            $parts[] = 'tags: '.implode(', ', $tags);
        }
        return implode('; ', $parts);
    }

    private function chatLearningRowValue(object $row, string $field)
    {
        return property_exists($row, $field) ? $row->{$field} : null;
    }

    private function chatLearningMemoryColumns(): array
    {
        static $columns = null;
        if ($columns !== null) {
            return $columns;
        }
        try {
            $columns = Schema::getColumnListing('chat_learning_memories');
        } catch (Throwable) {
            $columns = [];
        }
        return $columns;
    }

    private function chatLearningContextSummary(Request $request, array $tags): string
    {
        $parts = [];
        $filePath = trim((string) $request->input('filePath', ''));
        if ($filePath !== '') {
            $parts[] = 'Selected file: '.$this->chatLearningRedact($filePath);
        }
        $filePaths = $this->chatLearningFilePaths($request);
        if ($filePaths !== []) {
            $parts[] = 'Project files: '.implode(', ', array_slice($filePaths, 0, 8));
        }
        if ($tags !== []) {
            $parts[] = 'Tags: '.implode(', ', array_slice($tags, 0, 10));
        }
        return Str::limit(implode(' | ', $parts), 1000, '');
    }

    private function chatLearningFilePaths(Request $request): array
    {
        $paths = [];
        $selected = trim((string) $request->input('filePath', ''));
        if ($selected !== '') {
            $paths[] = $this->chatLearningRedact($selected);
        }
        foreach (array_slice((array) $request->input('projectFiles', []), 0, 40) as $item) {
            $path = is_array($item) ? trim((string) ($item['path'] ?? '')) : trim((string) $item);
            if ($path !== '') {
                $paths[] = $this->chatLearningRedact($path);
            }
        }
        return array_values(array_unique(array_slice($paths, 0, 40)));
    }

    private function chatLearningErrorSignature(string $value): ?string
    {
        $redacted = $this->chatLearningRedact($value);
        if (preg_match('/\b(?:error|exception|failed|failure|crash|blank|undefined|referenceerror|typeerror|syntaxerror)\b[^.!\n]{0,120}/i', $redacted, $match) !== 1) {
            return null;
        }
        $signature = Str::lower($this->singleLine($match[0]));
        $signature = preg_replace('/\d+/', '#', $signature) ?? $signature;
        return Str::limit($signature, 160, '');
    }

    private function chatLearningRedact(string $value): string
    {
        $value = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[email]', $value) ?? $value;
        $value = preg_replace('/\b(?:sk|pk|rk|or|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_\-]{16,}\b/', '[secret]', $value) ?? $value;
        $value = preg_replace('/\b[A-Za-z0-9_\-]{32,}\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}\b/', '[token]', $value) ?? $value;
        $value = preg_replace('/\b(?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/i', '$1=[redacted]', $value) ?? $value;
        return $value;
    }

    private function chatLearningProjectKey(string $project): ?string
    {
        $project = trim(Str::lower($project));
        return $project === '' ? null : hash('sha256', $project);
    }

    private function singleLine(string $value): string
    {
        return trim(preg_replace('/\s+/', ' ', $value) ?? $value);
    }
}
