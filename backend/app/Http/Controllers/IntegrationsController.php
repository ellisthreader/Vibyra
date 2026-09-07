<?php

namespace App\Http\Controllers;

use App\Models\IntegrationConnection as Connection;
use App\Services\Auth\SessionAuthenticator;
use App\Services\Integrations\Attempts;
use App\Services\Integrations\Catalog;
use App\Services\Integrations\Connections;
use App\Services\Integrations\IntegrationLock;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class IntegrationsController extends Controller
{
    public function rpc(Request $request)
    {
        $auth = app(SessionAuthenticator::class)->authenticate((string) $request->bearerToken());
        abort_unless($auth && $auth['session']->user()->exists(), 401, 'Sign in to Vibyra again.');
        $session = $auth['session'];
        $v = $request->validate([
            'operation' => ['required', Rule::in(['list', 'start', 'poll', 'cancel', 'grant', 'disconnect', 'check', 'read'])],
            'device' => ['required', 'string', 'max:128', 'regex:/^[a-zA-Z0-9_-]+$/D'],
            'agent' => ['required', 'string', 'max:128', 'regex:/^[a-zA-Z0-9_-]+$/D'],
            'service' => ['sometimes', 'string', 'max:40'], 'shop' => ['sometimes', 'string', 'max:100'],
            'id' => ['sometimes', 'uuid'], 'enabled' => ['sometimes', 'boolean'],
        ]);
        try {
            $result = $this->perform($session, $v);

            return response()->json($result)->header('Cache-Control', 'no-store');
        } catch (ModelNotFoundException) {
            return response()->json(['error' => 'This integration is unavailable or has been removed.'], 404);
        } catch (HttpExceptionInterface $e) {
            return response()->json(['error' => $e->getMessage()], $e->getStatusCode())->header('Cache-Control', 'no-store');
        } catch (\Throwable) {
            return response()->json(['error' => 'The integration service could not finish. Please try again.'], 503);
        }
    }

    private function perform($session, array $v): array
    {
        $op = $v['operation'];
        $manager = app(Connections::class);
        if ($op === 'list') {
            return ['providers' => Catalog::visible(), 'connections' => Connection::query()->where('user_id', $session->user_id)
                ->orderBy('service')->orderBy('label')->get()->map(fn ($c) => $manager->metadata($c, $v['device'], $v['agent']))->all()];
        }
        if ($op === 'start') {
            return app(Attempts::class)->start($session, $v['service'] ?? '', $v['shop'] ?? '');
        }
        if (in_array($op, ['poll', 'cancel'], true)) {
            return app(Attempts::class)->status($session, $v['id'] ?? '', $op === 'cancel');
        }
        $c = Connection::query()->where('user_id', $session->user_id)->findOrFail($v['id'] ?? '');
        $result = IntegrationLock::run($session->user_id, $c->service, $c->shop_host ?? '',
            fn () => DB::transaction(function () use ($c, $op, $manager, $v): array {
                $c = Connection::query()->lockForUpdate()->findOrFail($c->id);
                $grant = DB::table('integration_grants')->where('connection_id', $c->id)->where('device', $v['device'])->where('agent', $v['agent']);
                if ($op === 'disconnect') {
                    $c->delete();

                    return ['ok' => true];
                }
                if ($op === 'grant') {
                    if ($v['enabled'] ?? false) {
                        abort_unless($c->status === 'connected', 409, 'Reconnect this account first.');
                        DB::table('integration_grants')->insertOrIgnore(['connection_id' => $c->id, 'device' => $v['device'], 'agent' => $v['agent']]);
                    } else {
                        $grant->delete();
                    }

                    return ['ok' => true];
                }
                if ($op === 'read') {
                    abort_unless($grant->exists(), 403, 'This agent has not been given access to that account.');
                }
                try {
                    $data = $manager->read($c);
                } catch (\Throwable $error) {
                    if ($error instanceof HttpExceptionInterface && $error->getStatusCode() === 409) {
                        $c->fill(['status' => 'reconnect'])->save();
                    }

                    return ['_error' => $error];
                }

                return $op === 'check' ? ['ok' => true] : ['data' => $data];
            }));
        if (isset($result['_error'])) {
            throw $result['_error'];
        }

        return $result;
    }

    public function callback(Request $request, string $service)
    {
        try {
            app(Attempts::class)->callback($service, $request->query());
            $message = 'Return to Vibyra to see your connection result. You can close this window.';
        } catch (\Throwable) {
            $message = 'This connection attempt is invalid or expired. Return to Vibyra and try again.';
        }

        return response('<!doctype html><meta charset="utf-8"><title>Vibyra connection</title><p>'.$message.'</p>')
            ->header('Cache-Control', 'no-store')->header('Referrer-Policy', 'no-referrer')
            ->header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    }
}
