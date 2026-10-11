<?php

namespace App\Services\Vibes;

use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * 402 `out_of_tokens`: the balance cannot cover this reply. `reason` says why so every client
 * shows the same notice: `balance` (not enough tokens, add more) or `paid_model` (this model
 * needs paid tokens or a plan). Same status and message as before; the code is additive.
 */
final class OutOfTokens extends HttpException
{
    public function __construct(string $message, public readonly string $reason)
    {
        parent::__construct(402, $message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['ok' => false, 'code' => 'out_of_tokens', 'reason' => $this->reason, 'error' => $this->getMessage(),
            'message' => $this->getMessage()], 402)->header('Cache-Control', 'private, no-store');
    }
}
