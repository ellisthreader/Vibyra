<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Integrations\{Catalogue, Installs, Registry};
use Illuminate\Http\Request;

class IntegrationsController extends Controller
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

    private function available(Request $request, string $integration)
    {
        abort_unless(config('integrations.enabled'), 503, 'Integrations are not switched on for this account yet.');
        abort_unless(app(Registry::class)->has($integration), 404, 'That integration does not exist.');
        return $this->authenticatedUser($request);
    }
}
