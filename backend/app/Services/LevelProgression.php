<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserLevelEvent;
use App\Services\Billing\CreditDeductor;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LevelProgression
{
    public function __construct(private readonly CreditDeductor $credits)
    {
    }

    public function record(User $user, string $action, string $contextId, array $meta = []): array
    {
        $action = trim($action);
        $contextId = trim($contextId);
        $xpByAction = (array) config('levels.actions', []);

        if (! array_key_exists($action, $xpByAction)) {
            throw ValidationException::withMessages(['action' => 'Unknown level activity.']);
        }

        if ($contextId === '') {
            throw ValidationException::withMessages(['contextId' => 'A stable activity context is required.']);
        }

        $contextHash = hash('sha256', $contextId);
        $existing = UserLevelEvent::where('user_id', $user->id)
            ->where('action', $action)
            ->where('context_hash', $contextHash)
            ->first();

        if ($existing) {
            return [
                'ok' => true,
                'duplicate' => true,
                'xpDelta' => 0,
                'levelBefore' => (int) $existing->level_before,
                'levelAfter' => (int) $existing->level_after,
                'rewards' => [],
                'level' => $this->payload($user->fresh() ?? $user),
            ];
        }

        return DB::transaction(function () use ($user, $action, $contextHash, $xpByAction, $meta) {
            $fresh = User::lockForUpdate()->findOrFail($user->id);
            $existing = UserLevelEvent::where('user_id', $fresh->id)
                ->where('action', $action)
                ->where('context_hash', $contextHash)
                ->first();

            if ($existing) {
                return [
                    'ok' => true,
                    'duplicate' => true,
                    'xpDelta' => 0,
                    'levelBefore' => (int) $existing->level_before,
                    'levelAfter' => (int) $existing->level_after,
                    'rewards' => [],
                    'level' => $this->payload($fresh),
                ];
            }

            $dailyCap = (int) config('levels.daily_xp_cap', 500);
            $earnedToday = (int) UserLevelEvent::where('user_id', $fresh->id)
                ->where('created_at', '>=', now()->startOfDay())
                ->sum('xp_delta');
            $xpDelta = max(0, min((int) $xpByAction[$action], $dailyCap - $earnedToday));
            $levelBefore = (int) ($fresh->level ?: 1);
            $xpTotal = (int) $fresh->level_xp_total + $xpDelta;
            $levelAfter = $this->levelForXp($xpTotal);

            $fresh->forceFill([
                'level_xp_total' => $xpTotal,
                'level' => $levelAfter,
            ])->save();

            UserLevelEvent::create([
                'user_id' => $fresh->id,
                'action' => $action,
                'context_hash' => $contextHash,
                'xp_delta' => $xpDelta,
                'level_before' => $levelBefore,
                'level_after' => $levelAfter,
                'meta' => array_slice($meta, 0, 12),
            ]);

            $rewards = $this->grantRewards($fresh, $levelAfter);

            return [
                'ok' => true,
                'duplicate' => false,
                'xpDelta' => $xpDelta,
                'levelBefore' => $levelBefore,
                'levelAfter' => $levelAfter,
                'rewards' => $rewards,
                'level' => $this->payload($fresh->fresh() ?? $fresh),
            ];
        });
    }

    public function payload(User $user): array
    {
        $level = max(1, (int) ($user->level ?: 1));
        $xp = max(0, (int) $user->level_xp_total);
        $currentThreshold = $this->thresholdForLevel($level);
        $nextThreshold = $this->thresholdForLevel($level + 1);
        $span = max(1, $nextThreshold - $currentThreshold);
        $currentXp = max(0, $xp - $currentThreshold);

        return [
            'level' => $level,
            'xpTotal' => $xp,
            'currentLevelXp' => $currentXp,
            'nextLevelXp' => $span,
            'progress' => min(1, $currentXp / $span),
            'dailyXpCap' => (int) config('levels.daily_xp_cap', 500),
            'nextReward' => $this->nextReward($level),
            'map' => $this->levelMap($level),
        ];
    }

    private function grantRewards(User $user, int $levelAfter): array
    {
        $rewardCredits = (array) config('levels.reward_credits', []);
        $rewardedThrough = (int) ($user->level_rewarded_level ?: 1);
        $granted = [];

        foreach ($rewardCredits as $level => $credits) {
            $level = (int) $level;
            $credits = (int) $credits;
            if ($level <= $rewardedThrough || $level > $levelAfter || $credits <= 0) {
                continue;
            }

            $this->credits->grant($user, $credits, 'level_reward', "level-reward:{$level}", [
                'level' => $level,
                'reason' => 'level_milestone',
            ]);
            $granted[] = ['level' => $level, 'credits' => $credits];
            $rewardedThrough = max($rewardedThrough, $level);
        }

        if ($rewardedThrough !== (int) ($user->level_rewarded_level ?: 1)) {
            $user->forceFill(['level_rewarded_level' => $rewardedThrough])->save();
        }

        return $granted;
    }

    private function nextReward(int $currentLevel): ?array
    {
        foreach ((array) config('levels.reward_credits', []) as $level => $credits) {
            if ((int) $level > $currentLevel) {
                return ['level' => (int) $level, 'credits' => (int) $credits];
            }
        }

        return null;
    }

    private function levelMap(int $currentLevel): array
    {
        $rewardCredits = (array) config('levels.reward_credits', []);
        $start = 1;
        $lastRewardLevel = max(array_map('intval', array_keys($rewardCredits ?: [1 => 0])));
        $end = max((int) config('levels.map_min_level', 20), $lastRewardLevel, $currentLevel + 10);
        $levels = [];

        for ($level = $start; $level <= $end; $level++) {
            $levels[] = [
                'level' => $level,
                'xpTotalRequired' => $this->thresholdForLevel($level),
                'rewardCredits' => (int) ($rewardCredits[$level] ?? 0),
                'status' => $level < $currentLevel ? 'complete' : ($level === $currentLevel ? 'current' : 'locked'),
            ];
        }

        return $levels;
    }

    private function levelForXp(int $xp): int
    {
        $level = 1;
        while ($xp >= $this->thresholdForLevel($level + 1)) {
            $level++;
        }

        return $level;
    }

    private function thresholdForLevel(int $level): int
    {
        $base = (int) config('levels.threshold_base_xp', 120);
        $previousLevels = max(0, $level - 1);

        return $base * $previousLevels * $previousLevels;
    }
}
