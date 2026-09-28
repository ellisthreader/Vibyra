<?php

namespace App\Http\Controllers\Concerns;

use App\Services\LevelProgression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

trait LevelEndpoints
{
    public function levelActivity(Request $request, LevelProgression $levels): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        try {
            $result = $levels->record(
                $user,
                (string) $request->input('action', ''),
                (string) $request->input('contextId', ''),
                is_array($request->input('meta')) ? $request->input('meta') : [],
            );
        } catch (ValidationException $exception) {
            return $this->json([
                'ok' => false,
                'error' => collect($exception->errors())->flatten()->first() ?? 'Invalid level activity.',
            ], 422);
        }

        return $this->json([
            ...$result,
            'user' => $this->userPayload($user->fresh() ?? $user),
        ]);
    }
}
