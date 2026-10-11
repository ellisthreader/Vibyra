<?php

namespace App\Services\Spend;

use App\Services\Membership\Units;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * 429 `spend_cap`: the person's own limit, never the 402 "buy more tokens" path. An
 * HttpException so every existing catch of one (cloud renewal, job settle) treats it as a
 * refusal, with its own JSON body so clients can name the cap and offer to raise it.
 */
final class Refusal extends HttpException
{
    private const NAMES = ['day' => 'daily', 'month' => 'monthly', 'run' => 'per-task'];

    /** @param array{cap:string,limit:float,used:float,unit:string,resetsAt:?string,raisable:bool} $detail */
    public function __construct(string $message, public readonly array $detail)
    {
        parent::__construct(429, $message);
    }

    /** Limits and use are canonical units (10,000 per token); the body speaks in tokens. */
    public static function for(string $kind, int $limit, int $used, ?string $tz, ?\DateTimeInterface $resets): self
    {
        $tokens = self::tokens($limit);
        $reset = $resets ? Carbon::instance($resets) : null;
        $when = $reset ? ' It resets '.($kind === 'month' ? 'on ' : 'at ').Periods::resetWords($kind, $tz, $reset)
            .', or you can raise it for '.($kind === 'month' ? 'this month' : 'today').'.' : '';
        $message = $kind === 'run'
            ? 'This task reached your per-task limit of '.$tokens.' tokens, so it paused. Nothing spent so far was lost.'
            : 'You have reached your '.self::NAMES[$kind].' spending limit of '.$tokens.' tokens.'.$when;
        return new self($message, ['cap' => $kind, 'limit' => $tokens, 'used' => self::tokens($used), 'unit' => 'tokens',
            'resetsAt' => $reset?->toIso8601String(), 'raisable' => $kind !== 'run']);
    }

    public static function tokens(int $units): float|int
    {
        $t = round($units / Units::SCALE, 2);
        return $t == (int) $t ? (int) $t : $t;
    }

    public function render(): JsonResponse
    {
        return response()->json(['ok' => false, 'code' => 'spend_cap', 'error' => $this->getMessage(),
            'message' => $this->getMessage(), ...$this->detail], 429)->header('Cache-Control', 'private, no-store');
    }
}
