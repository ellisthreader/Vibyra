<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

trait ChatLearningMemory
{
    use ChatLearningRanking;
    use ChatLearningStorage;
    use ChatLearningTags;

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

}
