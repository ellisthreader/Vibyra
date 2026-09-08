<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\SessionState\StateDelta;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

trait SessionStateEndpoints
{
    public function saveState(Request $request): JsonResponse
    {
        $id = $this->authenticatedUser($request)->id;
        return DB::transaction(function () use ($request, $id) {
            $user = User::query()->lockForUpdate()->findOrFail($id);
            $this->persistSessionState($user, $request->only(['onboardingComplete', 'rememberedDesktops', 'appState']));
            return $request->input('responseMode') === 'ack-v1'
                ? $this->json(['ok' => true, 'syncVersion' => 1])
                : $this->json(['ok' => true, 'user' => $this->userPayload($user)]);
        });
    }

    public function saveStateDelta(Request $request): JsonResponse
    {
        $id = $this->authenticatedUser($request)->id;
        if ($request->input('syncVersion') !== 1 || ! is_array($request->input('changes'))) {
            return $this->json(['ok' => false, 'error' => 'Unsupported state sync payload.'], 422);
        }
        if (strlen($request->getContent()) > 48 * 1024 * 1024) {
            return $this->json(['ok' => false, 'error' => 'State change batch is too large.'], 413);
        }
        return DB::transaction(function () use ($request, $id) {
            $user = User::query()->lockForUpdate()->findOrFail($id);
            $appState = $user->app_state;
            $state = [
                'onboardingComplete' => (bool) $user->onboarding_complete,
                'rememberedDesktops' => $this->normalizeRememberedDesktops($user->remembered_desktops),
                'appState' => is_array($appState) ? $appState : [],
            ];
            try {
                $next = StateDelta::apply($state, $request->input('changes'));
            } catch (InvalidArgumentException $error) {
                return $this->json(['ok' => false, 'error' => $error->getMessage()], 422);
            } catch (RuntimeException) {
                return $this->json(['ok' => false, 'error' => 'Cloud changes conflict with this edit. Your local copy is preserved.'], 409);
            }
            if (! is_array($next['appState']) || ! is_array($next['rememberedDesktops']) || ! is_bool($next['onboardingComplete'])) {
                return $this->json(['ok' => false, 'error' => 'Invalid state field types.'], 422);
            }
            if (strlen(json_encode($next, JSON_THROW_ON_ERROR)) > 48 * 1024 * 1024) {
                return $this->json(['ok' => false, 'error' => 'Saved state is too large.'], 413);
            }
            $this->persistSessionState($user, $next, $state['appState']);
            return $this->json(['ok' => true, 'syncVersion' => 1]);
        });
    }

    private function persistSessionState(User $user, array $input, ?array $existing = null): void
    {
        if (array_key_exists('onboardingComplete', $input)) $user->onboarding_complete = (bool) $input['onboardingComplete'];
        if (array_key_exists('rememberedDesktops', $input)) {
            $user->remembered_desktops = $this->normalizeRememberedDesktops($input['rememberedDesktops']);
        }
        if (isset($input['appState']) && is_array($input['appState'])) {
            $incoming = $input['appState'];
            $existing ??= $user->app_state;
            $existing = is_array($existing) ? $existing : [];
            $merged = array_replace($existing, $incoming);
            $merged['projectMemories'] = $this->mergeProjectMemoriesState(
                is_array($incoming['projectMemories'] ?? null) ? $incoming['projectMemories'] : [],
                is_array($existing['projectMemories'] ?? null) ? $existing['projectMemories'] : []
            );
            $user->app_state = $merged;
        }
        if ($user->isDirty()) $user->save();
    }
}
