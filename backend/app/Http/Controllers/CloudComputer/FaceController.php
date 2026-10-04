<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\FaceKeys;
use Illuminate\Http\Request;

/** The phone's Face ID key for "Connect to cloud": registered right after sign-in, then challenged on Connect. */
final class FaceController extends Controller
{
    use UserPayloads;

    public function enroll(Request $request, FaceKeys $faces)
    {
        $session = $this->authenticatedSession($request);
        $faces->enroll($session, strtolower((string) $request->input('publicKey')));
        return $this->json(['ok' => true])->header('Cache-Control', 'private, no-store');
    }

    public function challenge(Request $request, FaceKeys $faces)
    {
        $session = $this->authenticatedSession($request);
        return $this->json(['ok' => true] + $faces->challenge($session))->header('Cache-Control', 'private, no-store');
    }
}
