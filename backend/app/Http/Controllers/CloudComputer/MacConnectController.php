<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Models\RemoteHost;
use App\Services\CloudComputer\{AccessProjects, Computers, ConnectConsent};
use App\Services\Remote\{RemoteAccessException, RemoteIdentityProof};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;

/**
 * POST /api/cloud-computer/connect/mac: the Mac's "Keep projects ready for your iPhone" agreement
 * (docs/cloud-access-contract.md, "Connect from the Mac"). The same agreement as the phone's /connect, but instead of a
 * Face ID proof it needs the Mac to prove it holds its own registered computer key (a sealed `cloud-connect` challenge
 * from POST /api/remote/hosts/challenge) that the person has already reached from their iPhone with Face ID or a passkey,
 * so a stolen session token alone cannot switch Cloud on. Off until CLOUD_MAC_CONNECT_ENABLED.
 */
final class MacConnectController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $request, Computers $computers, ConnectConsent $consent, RemoteIdentityProof $proof)
    {
        if (!config('cloud_workspaces.mac_connect_enabled')) Computers::fail('mac_connect_off', 'Turn on Vibyra Cloud from your iPhone.', 404);
        $session = $this->authenticatedSession($request);
        $user = $this->authenticatedUser($request); app(Wallet::class)->ensure($user);
        $v = Validator::make($request->all(), ['accept' => 'required|accepted', 'consentVersion' => 'required|integer|min:1',
            'hostId' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'], 'challengeId' => 'required|uuid', 'proof' => 'required|string|max:64',
            'projects' => 'sometimes|array|max:'.AccessProjects::MAX_ITEMS, 'projects.*' => 'required|array',
            'projects.*.id' => 'required|string|min:1|max:255', 'projects.*.name' => 'required|string|max:120']);
        if ($v->fails()) Computers::fail('invalid_request', (string) $v->errors()->first(), 422);
        $d = $v->validated();
        if ((int) $d['consentVersion'] !== $consent->current()) {
            Computers::fail('consent_outdated', 'The cloud terms changed. Read them again to connect.', 409, ['current' => $consent->current()]);
        }
        DB::transaction(function () use ($user, $session, $d, $proof) {
            $host = RemoteHost::query()->where('host_id', $d['hostId'])->lockForUpdate()->first();
            if (!$host || (string) $host->user_id !== (string) $user->id || $host->revoked_at !== null) {
                Computers::fail('host_required', 'Turn on iPhone connection in Settings first, then try again.', 409);
            }
            // A session token alone can register a computer key of its own, so proving that key is not enough: the person must
            // have reached this Mac from their iPhone with Face ID or a passkey (a remote session is only made after that check,
            // RequireRemoteAccessAuthorization; a live confirmation covers one not yet kept as a session).
            $confirmed = DB::table('remote_sessions')->where('user_id', $user->id)->where('remote_host_id', $host->id)->exists()
                || DB::table('remote_strong_auth as a')->join('trusted_devices as t', 't.id', '=', 'a.trusted_device_id')
                    ->where('t.user_id', $user->id)->where('t.remote_host_id', $host->id)->whereNotNull('a.verified_at')->exists();
            if (!$confirmed) Computers::fail('phone_confirm_required', 'Connect your iPhone to this Mac once, or connect to the cloud from your iPhone.', 409);
            // Only a `cloud-connect` challenge answers this: one issued for enrolling or moving the computer is refused.
            try { $proof->consume($user, $session->id, $d['hostId'], $host, $d['challengeId'], $d['proof'], ['cloud-connect']); }
            catch (RemoteAccessException) { Computers::fail('proof_invalid', 'Verify this Mac again, then try again.', 409); }
        });
        $w = $computers->create($user->id, (string) Str::uuid(), 'Cloud'); // refuses a non-entitled account before any consent is kept
        $consent->record($user->id, $consent->current(), 'mac', $request);
        if (!empty($d['projects'])) app(AccessProjects::class)->decide($user->id, AccessController::items($d['projects'], true), 'mac');
        DB::table('cloud_workspaces')->where('id', $w->id)->whereNull('terms_accepted_at')->update(['terms_accepted_at' => now(), 'updated_at' => now()]);
        return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
    }
}
