<?php

namespace App\Http\Controllers\Teams;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Http\Controllers\Controller;
use App\Models\{OrganizationSso, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\Sso\{Domains, Exchange, Flow, IdToken, SignIn, SsoException};
use App\Services\Teams\Teams;
use Illuminate\Http\{Request, Response};
use Illuminate\Support\Facades\{Auth, Cache};

/**
 * Sign in with a team's identity provider. `start` takes a work email and, when its domain is a verified, enabled SSO domain, returns
 * the provider's authorization URL. `callback` is the single redirect URI: it never redirects anywhere the request names (the
 * destination is a fixed path, errors are a fixed code), never echoes provider text, and finishes only a flow it started.
 * The browser keeps the result in its own session; an app polls `status` with a secret only it knows.
 */
final class SsoAuthController extends Controller
{
    use UserPayloads;

    /** Lets the log-in page decide whether to offer "Use single sign-on" at all: Teams on or off, nothing else. */
    public function available()
    {
        return response()->json(['ok' => true, 'enabled' => Teams::enabled()])->header('Cache-Control', 'no-store');
    }

    public function start(Request $request, Flow $flows)
    {
        $cfg = $this->config($request);
        $binding = bin2hex(random_bytes(32));
        $begun = $flows->start($cfg, 'web', $binding);
        $request->session()->put('team_sso_binding', $binding);
        return response()->json(['ok' => true, 'authUrl' => $begun['authUrl']])->header('Cache-Control', 'no-store');
    }

    /** The app/desktop variant: the same flow, collected by polling with the secret the app generated. */
    public function startApp(Request $request, Flow $flows)
    {
        $input = $request->validate(['flowSecret' => 'required|string|min:32|max:256',
            'deviceName' => 'nullable|string|max:120', 'installId' => 'nullable|string|max:128']);
        $secret = $input['flowSecret'];
        if (strlen($secret) < 32 || strlen($secret) > 256) ApiError::throw(422, 'flow_secret', 'Update Vibyra and try again.');
        $cfg = $this->config($request);
        $begun = $flows->start($cfg, 'app', null, ['deviceName' => $input['deviceName'] ?? 'Vibyra App',
            'installId' => $input['installId'] ?? '', 'secretHash' => hash('sha256', $secret)]);
        Cache::put('team-sso:pending:'.hash('sha256', $begun['flowId']), hash('sha256', $secret), now()->addMinutes((int) config('teams.sso_flow_minutes')));
        return response()->json(['ok' => true, 'authUrl' => $begun['authUrl'], 'flowId' => $begun['flowId']])->header('Cache-Control', 'no-store');
    }

    public function status(Request $request, string $flowId)
    {
        if (!Teams::enabled()) abort(404);
        $key = hash('sha256', $flowId);
        $secret = hash('sha256', (string) $request->header('X-Vibyra-Flow-Secret', ''));
        return Cache::lock('team-sso:collect:'.$key, 15)->block(5, function () use ($key, $secret) {
        $result = Cache::get('team-sso:result:'.$key);
        $pending = Cache::get('team-sso:pending:'.$key);
        $expected = is_array($result) ? $result['secretHash'] : $pending;
        if (!is_string($expected)) return response()->json(['ok' => false, 'status' => 'expired'], 410);
        if (!hash_equals($expected, $secret)) return response()->json(['ok' => false, 'status' => 'forbidden'], 403);
        if (!is_array($result)) return response()->json(['ok' => true, 'status' => 'pending']);
        Cache::forget('team-sso:result:'.$key);
        Cache::forget('team-sso:pending:'.$key);
        return response()->json($result['payload'])->header('Cache-Control', 'no-store');
        });
    }

    public function callback(Request $request, Flow $flows, Exchange $exchange, IdToken $tokens, SignIn $signIn)
    {
        if (!Teams::enabled()) abort(404);
        $flow = null;
        try {
            $state = $request->query('state', '');
            if (!is_string($state)) throw new SsoException('sso_state', 'state');
            $flow = $flows->consume($state);
            $cfg = OrganizationSso::query()->find($flow['org']);
            if (!$cfg || !$cfg->enabled || $cfg->verified_domain === null) throw new SsoException('sso_unavailable');
            \App\Services\Teams\Sso\Configuration::requireCurrent($cfg, $flow['configurationHash'] ?? null);
            if ($request->query('error') !== null) throw new SsoException('cancelled');
            if ($flow['mode'] === 'web') {
                $bound = (string) $request->session()->pull('team_sso_binding', '');
                if ($bound === '' || !is_string($flow['binding']) || !hash_equals($flow['binding'], hash('sha256', $bound))) throw new SsoException('sso_state', 'session');
            }
            $code = $request->query('code', '');
            if (!is_string($code) || !preg_match('/^[\x21-\x7e]{1,2048}$/D', $code)) throw new SsoException('sso_provider', 'code');
            $identity = $tokens->verify($exchange->idToken($cfg, $flow, $code), $cfg, $flow['meta'], $flow['nonce']);
            $user = $signIn->resolve($cfg, $identity);
        } catch (SsoException $e) {
            return $this->failed($flow, $e);
        }
        return $flow['mode'] === 'app' ? $this->finishApp($flow, $user) : $this->finishWeb($request, $user);
    }

    private function config(Request $request): OrganizationSso
    {
        Teams::enabled() || ApiError::throw(404, 'not_available', 'Teams is not switched on.');
        $domain = Domains::domainOf(strtolower(trim((string) $request->validate(['email' => 'required|string|max:254'])['email'])));
        $cfg = $domain ? OrganizationSso::query()->where('verified_domain', $domain)->where('enabled', true)->first() : null;
        return $cfg ?? ApiError::throw(404, 'sso_unavailable', 'Single sign-on is not set up for that email address.');
    }

    /** Fixed destination, no request-supplied URL anywhere in this controller. */
    private function finishWeb(Request $request, User $user)
    {
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        return redirect('/account/team');
    }

    private function finishApp(array $flow, User $user): Response
    {
        $session = \Illuminate\Http\Request::create('/api/auth/sso/session', 'POST', ['deviceName' => $flow['app']['deviceName'], 'installId' => $flow['app']['installId']]);
        $session->attributes->set('sso_verified', true);
        $this->store($flow, $this->sessionPayload($session, $user));
        return response('<!doctype html><meta charset="utf-8"><title>Signed in</title><p style="font:16px system-ui;margin:3em auto;max-width:28em">You are signed in. Return to the Vibyra app.</p>', 200, ['Content-Type' => 'text/html; charset=utf-8', 'Cache-Control' => 'no-store']);
    }

    private function failed(?array $flow, SsoException $e)
    {
        $code = in_array($e->reason, SsoException::CODES, true) ? $e->reason : 'sso_provider';
        if ($flow && $flow['mode'] === 'app') {
            $this->store($flow, ['ok' => false, 'status' => 'failed', 'code' => $code]);
            return response('<!doctype html><meta charset="utf-8"><title>Sign-in failed</title><p style="font:16px system-ui;margin:3em auto;max-width:28em">Sign-in did not complete. Return to the Vibyra app and try again.</p>', 400, ['Content-Type' => 'text/html; charset=utf-8']);
        }
        return redirect('/login?sso_error='.$code);
    }

    private function store(array $flow, array $payload): void
    {
        Cache::put('team-sso:result:'.hash('sha256', $flow['flowId']), ['secretHash' => $flow['app']['secretHash'], 'payload' => $payload], now()->addMinutes(5));
    }
}
