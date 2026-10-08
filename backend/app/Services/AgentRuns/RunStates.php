<?php

namespace App\Services\AgentRuns;

/** The run lifecycle from the rebuild plan §4, with the only legal transitions. */
final class RunStates
{
    public const QUEUED = 'queued';
    public const WAITING_COMPUTER = 'waiting_for_computer';
    public const STARTING = 'starting';
    public const RUNNING = 'running';
    public const WAITING_TOOL = 'waiting_for_tool';
    public const WAITING_APPROVAL = 'waiting_for_approval';
    public const WAITING_SIGNIN = 'waiting_for_signin';
    public const PAUSED_LIMITS = 'paused_by_limits';
    public const COMPLETED = 'completed';
    public const FAILED = 'failed';
    public const CANCELLED = 'cancelled';
    public const UNKNOWN = 'outcome_unknown';

    public const TERMINAL = [self::COMPLETED, self::FAILED, self::CANCELLED, self::UNKNOWN];
    /** States a runner may claim (a live lease is checked separately). */
    public const CLAIMABLE = [self::QUEUED, self::WAITING_COMPUTER, self::STARTING, self::RUNNING,
        self::WAITING_TOOL, self::WAITING_SIGNIN, self::PAUSED_LIMITS];
    /** States in which the leased runner may post model output or tool calls (resuming a wait). */
    public const ACTIVE = [self::STARTING, self::RUNNING, self::WAITING_TOOL, self::WAITING_SIGNIN, self::PAUSED_LIMITS];

    private const NEXT = [
        self::QUEUED => [self::WAITING_COMPUTER, self::STARTING],
        self::WAITING_COMPUTER => [self::QUEUED, self::STARTING],
        self::STARTING => [self::RUNNING, self::STARTING],
        self::RUNNING => [self::WAITING_TOOL, self::WAITING_APPROVAL, self::WAITING_SIGNIN,
            self::PAUSED_LIMITS, self::COMPLETED, self::STARTING],
        self::WAITING_TOOL => [self::RUNNING, self::WAITING_APPROVAL, self::WAITING_SIGNIN, self::STARTING],
        self::WAITING_APPROVAL => [self::RUNNING],
        self::WAITING_SIGNIN => [self::RUNNING, self::STARTING],
        self::PAUSED_LIMITS => [self::RUNNING, self::STARTING],
    ];

    public static function terminal(string $state): bool
    {
        return in_array($state, self::TERMINAL, true);
    }

    /** Failure, cancellation and unknown outcome are reachable from every live state. */
    public static function allowed(string $from, string $to): bool
    {
        if (self::terminal($from)) return false;
        if ($to === self::PAUSED_LIMITS && in_array($from, self::CLAIMABLE, true)) return true;
        if (in_array($to, [self::FAILED, self::CANCELLED, self::UNKNOWN], true)) return true;
        return in_array($to, self::NEXT[$from] ?? [], true);
    }
}
