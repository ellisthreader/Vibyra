<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

trait NativeTerminalRoutes
{
    public function anthropicTerminalMessages(Request $request): Response
        {
            return $this->dispatchNativeTerminal(
                $request, 'anthropic', (string) $request->input('model', ''), $request->all()
            );
        }
    public function anthropicTerminalCountTokens(Request $request): JsonResponse
        {
            $this->authenticatedUser($request);
            return response()->json([
                'input_tokens' => max(1, (int) ceil(strlen(json_encode($request->all())) / 4)),
            ]);
        }
    public function geminiTerminalRequest(Request $request, string $model, string $action): Response
        {
            if ($action === 'countTokens') {
                $this->authenticatedUser($request);
                return response()->json([
                    'totalTokens' => max(1, (int) ceil(strlen(json_encode($request->all())) / 4)),
                ]);
            }
            if (! in_array($action, ['generateContent', 'streamGenerateContent'], true)) {
                return $this->nativeTerminalError('Unsupported Gemini terminal operation.', 404, 'google');
            }
            return $this->dispatchNativeTerminal(
                $request, 'gemini', $model, $request->all(), $action === 'streamGenerateContent'
            );
        }
}
