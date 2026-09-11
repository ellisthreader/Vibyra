<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Auth\{ProviderAccountException, ProviderAccountService};
use App\Services\ChatConnectors\{Catalogue, ConnectorOAuth, Installs, Registry};
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ChatConnectorsController extends Controller
{
    use UserPayloads;

    /**
     * The catalogue answers signed out and with the flag off, because it is a menu.
     * Everything below it is account state and is gated on both.
     */
    public function index(Request $request, Catalogue $catalogue)
    {
        return $this->json($catalogue->payload($this->optionalAuthenticatedUser($request)?->id));
    }

    public function connect(Request $request, string $integration, Installs $installs, Catalogue $catalogue)
    {
        $user = $this->available($request, $integration);
        $data = $request->validate(['credential' => 'required|string|max:1000']);
        $installs->connect($user->id, $integration, trim($data['credential']));
        return $this->json($catalogue->payload($user->id));
    }

    public function disconnect(Request $request, string $integration, Installs $installs, Catalogue $catalogue)
    {
        $user = $this->available($request, $integration);
        $installs->disconnect($user->id, $integration);
        return $this->json($catalogue->payload($user->id));
    }

    /**
     * Begin a sign-in: the provider's page for the phone to open, and the flow to
     * read back. A signed-out phone may begin one with a provider that can sign it
     * in too, so connecting GitHub never stops at a Vibyra login page first.
     */
    public function start(Request $request, string $integration, ConnectorOAuth $oauth)
    {
        abort_unless(config('chat_connectors.enabled'), 503, 'Integrations are not switched on for this account yet.');
        abort_unless(app(Registry::class)->has($integration), 404, 'That integration does not exist.');
        $data = $request->validate(['returnUrl' => 'nullable|string|max:500']);
        return $this->json($oauth->start($this->optionalAuthenticatedUser($request)?->id, $integration, $data['returnUrl'] ?? null));
    }

    /**
     * How a sign-in ended, with the catalogue as it now stands. A phone that began
     * signed out also receives the Vibyra session the provider's identity produced.
     */
    public function flow(Request $request, string $flow, ConnectorOAuth $oauth, Catalogue $catalogue)
    {
        $reader = $this->optionalAuthenticatedUser($request)?->id;
        $state = $oauth->status($flow, $reader);
        $whose = $reader ?? (isset($state['session']) ? $oauth->owner($flow) : null);
        return $this->json([...$state, 'catalogue' => $catalogue->payload($whose)]);
    }

    /**
     * Where the provider sends the browser back. It arrives with no app session, so
     * the account is the one recorded when the sign-in started. The token is proved
     * and stored exactly as a pasted key would be; then the browser goes on to the
     * app, which closes the sign-in sheet, or, opened any other way, gets a page.
     */
    public function callback(Request $request, string $integration, ConnectorOAuth $oauth, Installs $installs)
    {
        [$flow, $token] = $oauth->finish($integration, (string) $request->query('state', ''),
            (string) $request->query('code', ''), (string) $request->query('error', ''));
        if ($flow && $token !== null) {
            try {
                // Signed out when it began: the provider's identity signs the person in, by
                // the same rule as Apple and Google - a new account from a verified email,
                // and never a quiet link to an existing account that has the same email.
                $user = $flow['userId'] === null
                    ? app(ProviderAccountService::class)->resolve($request, $integration, $oauth->identify($integration, $token))
                    : null;
                $userId = $user?->id ?? (int) $flow['userId'];
                $installs->connect($userId, $integration, $token);
                $oauth->succeed($flow, $userId, $user ? $this->sessionPayload($request, $user) : null);
            } catch (ProviderAccountException $e) {
                $oauth->fail($flow, $e->getMessage());
            } catch (HttpException $e) {
                $oauth->fail($flow, $e->getMessage());
            }
        }
        $name = $oauth->name($integration);
        if ($flow && ($to = $oauth->returnTo($flow))) return redirect()->away($to);
        $connected = $flow && ($oauth->owner((string) $flow['flowId']) !== null)
            && $oauth->status((string) $flow['flowId'], $oauth->owner((string) $flow['flowId']))['status'] === 'connected';
        return $connected ? $this->page($name.' is connected', 'You can close this page and go back to Vibyra.')
            : $this->page($name.' was not connected', 'You can close this page and try again in Vibyra.');
    }

    private function page(string $title, string $detail)
    {
        return response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
            .'<title>'.e($title).'</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;'
            .'font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0E0F12;color:#F5F7FA">'
            .'<main style="text-align:center;padding:24px"><h1 style="font-size:23px;margin:0 0 8px">'.e($title).'</h1>'
            .'<p style="margin:0;color:#A6ADBA">'.e($detail).'</p></main>')->header('Content-Type', 'text/html');
    }

    private function available(Request $request, string $integration)
    {
        abort_unless(config('chat_connectors.enabled'), 503, 'Integrations are not switched on for this account yet.');
        abort_unless(app(Registry::class)->has($integration), 404, 'That integration does not exist.');
        return $this->authenticatedUser($request);
    }
}
