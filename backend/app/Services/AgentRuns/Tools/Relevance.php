<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\Run;
use Illuminate\Support\Facades\DB;

/**
 * Deterministic, metadata-only relevance of each granted connection to one run:
 * no model call, no Vibyra tokens. Signals, strongest first: the connection's
 * account label or the service name in the prompt, the trigger that started the
 * run, service words in the prompt, the teammate's saved job, and which accounts
 * earlier turns of this conversation actually used.
 */
final class Relevance
{
    /** provider => [names (explicit service mentions), hints (words a task about it uses)] */
    public const TERMS = [
        'gmail' => [['gmail', 'google mail'], ['email', 'emails', 'mail', 'inbox', 'unread', 'reply', 'send']],
        'github' => [['github', 'git hub'], ['repo', 'repository', 'repositories', 'pull request', 'pull requests', 'pr', 'prs', 'issue', 'issues', 'ci', 'review']],
        'google_calendar' => [['google calendar', 'gcal'], ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule', 'agenda', 'availability', 'free time']],
        'slack' => [['slack'], ['channel', 'channels', 'dm', 'thread']],
        'notion' => [['notion'], ['page', 'pages', 'wiki', 'notes']],
        'linear' => [['linear'], ['ticket', 'tickets', 'issue', 'issues', 'backlog', 'sprint']],
        'google_drive' => [['google drive', 'gdrive', 'google docs', 'google sheets'], ['drive', 'doc', 'docs', 'document', 'spreadsheet', 'sheet']],
        'google_tasks' => [['google tasks'], ['task list', 'todo', 'to-do', 'todos', 'reminder']],
        'figma' => [['figma'], ['design', 'designs', 'mockup', 'frame']],
        'outlook_mail' => [['outlook'], ['email', 'emails', 'mail', 'inbox', 'unread', 'reply', 'send']],
        'outlook_calendar' => [['outlook calendar'], ['calendar', 'meeting', 'meetings', 'event', 'events', 'schedule', 'agenda']],
        'onedrive' => [['onedrive', 'one drive'], ['file', 'files', 'document']],
        'teams' => [['microsoft teams', 'ms teams'], ['channel', 'channels', 'teams chat']],
        'sharepoint' => [['sharepoint'], ['site', 'intranet']],
        'computer' => [['my mac', 'my computer', 'workspace', 'project folder'], ['code', 'codebase', 'file', 'files', 'folder', 'test', 'tests', 'branch', 'commit', 'refactor', 'bug', 'fix']],
    ];
    private const TRIGGER_PROVIDERS = ['github.issue' => 'github', 'github.pull_request' => 'github',
        'gmail.message' => 'gmail', 'calendar.event_soon' => 'google_calendar'];

    /**
     * @param array<int, array{0: string, 1: string, 2: ?string}> $connections [connectionId, provider, account label]
     * @return array<string, int> connectionId => score
     */
    public function scores(Run $run, array $connections): array
    {
        $prompt = self::normalize((string) $run->prompt);
        $agent = DB::table('agent_teammates')->where('id', $run->agent_id)->first(['brief', 'memory']);
        $profile = self::normalize(($agent->brief ?? '').' '.($agent->memory ?? ''));
        [$triggerProvider, $triggerConnection] = $this->trigger($run);
        $history = $this->history($run);
        $scores = [];
        foreach ($connections as [$id, $provider, $account]) {
            [$names, $hints] = self::TERMS[$provider] ?? [[str_replace('_', ' ', $provider)], []];
            $score = (self::mentions($prompt, $names) ? 100 : 0) + (self::mentions($prompt, $hints) ? 40 : 0)
                + (self::mentions($profile, $names) ? 30 : 0) + (self::mentions($profile, $hints) ? 12 : 0);
            if (is_string($account) && mb_strlen($account) >= 3 && self::mentions($prompt, [mb_strtolower($account)])) $score += 150;
            if ($triggerProvider === $provider) $score += 80;
            if ($triggerConnection === $id) $score += 40;
            $scores[$id] = $score + min(30, 3 * (int) ($history[$id] ?? 0));
        }
        return $scores;
    }

    /** Words of a tool's own name found in the prompt (e.g. "send", "comment"): orders tools inside one account. */
    public function toolHits(Run $run, string $tool): int
    {
        $prompt = self::normalize((string) $run->prompt);
        $words = array_slice(explode('_', preg_replace('/^(mcp_[0-9a-f]{8}|composio_[a-z0-9]+)__/', '', $tool)), 1);
        return count(array_filter($words, fn ($w) => strlen($w) >= 3 && self::mentions($prompt, [$w])));
    }

    /** Providers named or hinted in the prompt or the teammate job, strongest first (for the task plan). */
    public function mentionedProviders(Run $run): array
    {
        $prompt = self::normalize((string) $run->prompt);
        $agent = DB::table('agent_teammates')->where('id', $run->agent_id)->first(['brief']);
        $brief = self::normalize((string) ($agent->brief ?? ''));
        $named = [];
        foreach (self::TERMS as $provider => [$names]) {
            if (self::mentions($prompt, $names) || self::mentions($brief, $names)) $named[] = $provider;
        }
        [$triggerProvider] = $this->trigger($run);
        if ($triggerProvider && !in_array($triggerProvider, $named, true)) $named[] = $triggerProvider;
        return $named;
    }

    public static function normalize(string $text): string
    {
        return ' '.preg_replace('/[^\p{L}\p{N}@.\-]+/u', ' ', mb_strtolower(mb_substr($text, 0, 20000))).' ';
    }

    public static function mentions(string $normalized, array $terms): bool
    {
        foreach ($terms as $term) {
            if (preg_match('/(?<![\p{L}\p{N}])'.preg_quote($term, '/').'(?![\p{L}\p{N}])/u', $normalized)) return true;
        }
        return false;
    }

    /** @return array{0: ?string, 1: ?string} the provider and connection of the trigger that admitted this run */
    private function trigger(Run $run): array
    {
        $key = (string) $run->idempotency_key;
        if (!str_starts_with($key, 'trg:')) return [null, null];
        $trigger = DB::table('agent_trigger_events')->join('agent_triggers', 'agent_triggers.id', '=', 'agent_trigger_events.trigger_id')
            ->where('agent_trigger_events.id', substr($key, 4))->where('agent_trigger_events.user_id', $run->user_id)
            ->first(['agent_triggers.kind', 'agent_triggers.connection_id']);
        return [self::TRIGGER_PROVIDERS[$trigger->kind ?? ''] ?? null, $trigger->connection_id ?? null];
    }

    /** Executed tool calls per connection in the last 20 earlier turns of this conversation. */
    private function history(Run $run): array
    {
        if (!$run->agent_id) return [];
        $runs = Run::query()->where('user_id', $run->user_id)->where('agent_id', $run->agent_id)
            ->where('conversation_seq', '<', (int) ($run->conversation_seq ?: PHP_INT_MAX))
            ->orderByDesc('conversation_seq')->limit(20)->pluck('id');
        if ($runs->isEmpty()) return [];
        return DB::table('agent_tool_actions')->whereIn('run_id', $runs)->whereIn('state', ['completed', 'failed', 'unknown'])
            ->groupBy('connection_id')->selectRaw('connection_id, count(*) as uses')->pluck('uses', 'connection_id')->all();
    }
}
