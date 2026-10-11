<?php

namespace App\Services\Vibes;

use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * 429 `pace_limit`: a rolling plan window (5 hours or 7 days) is used up. It bounds how fast a
 * plan may spend, never how much: the balance is untouched. An HttpException so every existing
 * catch treats it as a refusal, with its own JSON body so clients can show the same notice.
 */
final class PaceRefusal extends HttpException
{
    /** @param array{window:string,resetsAt:?string} $detail */
    public function __construct(string $message, public readonly array $detail)
    {
        parent::__construct(429, $message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['ok' => false, 'code' => 'pace_limit', 'error' => $this->getMessage(),
            'message' => $this->getMessage(), ...$this->detail], 429)->header('Cache-Control', 'private, no-store');
    }
}
