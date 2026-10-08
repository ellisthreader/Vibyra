<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{AccessProjects, Computers, ConnectAgreement, ConnectConsent, ConnectSelections, FaceKeys, SyncRetention, Wake};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Validator};

/** POST /api/cloud-computer/connect: the phone's "Connect to cloud" agreement. Makes the computer, then records the consent.
 *  DELETE withdraws it: the computer is stopped, every synced project, conversation and login copy is deleted, and the
 *  computer's disk is removed as soon as it has stopped. */
final class ConnectController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $request, Computers $computers, FaceKeys $faces)
    {
        $session = $this->authenticatedSession($request);
        $user = $this->authenticatedUser($request);
        $v = Validator::make($request->all(), ['accept' => 'required|accepted', 'consentVersion' => 'required|integer|min:1']);
        if ($v->fails()) Computers::fail('invalid_request', 'Tick the box to agree before connecting.', 422);
        $choices = ConnectSelections::read($request);
        $agreement = app(ConnectAgreement::class);
        $version = (int) $request->input('consentVersion');
        $agreement->checkVersion($version);
        app(Wallet::class)->ensure($user);
        // Phone identity remains independent of the desktop's computer-key proof.
        if ($faces->required()) $faces->verify($session, $request->input('face'));
        $agreement->accept($user->id, $version, 'phone', $request, $choices);
        app(Wake::class)->forPerson($user->id);
        return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
    }

    private function keepsAnything(int $user): bool
    {
        foreach (['cloud_sync_projects', 'cloud_sync_macs', 'cloud_sync_vm_keys', 'cloud_sync_logins', 'cloud_project_access'] as $table) {
            if (DB::table($table)->where('user_id', $user)->exists()) return true;
        }
        $w = app(Computers::class)->find($user);
        return $w !== null && !in_array($w->state, ['stopped', 'archived', 'expired'], true);
    }

    public function revoke(Request $request, Computers $computers, ConnectConsent $consent)
    {
        $user = $this->authenticatedUser($request);
        // Same lock as Wake, so a wake already past its consent check finishes first and is then stopped here, and a later
        // one sees the withdrawal.
        [$w, $open] = DB::transaction(function () use ($user, $consent, $computers) {
            app(Wallet::class)->lock($user->id);
            $open = $consent->revoke($user->id);
            $w = $computers->find($user->id);
            if ($w) DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->delete(); // queued clones are not redone
            return [$w, $open];
        }, 5);
        // Idempotent: a second tap (or a retried request) finds nothing agreed and nothing kept, and changes nothing.
        if (!$open && !$this->keepsAnything($user->id)) return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
        // Keep withdrawal durable even if file deletion fails. A newer agreement between the two phases wins; otherwise
        // hold the account lock through cleanup so a fresh connect cannot have its new choices or uploads purged here.
        DB::transaction(function () use ($user, $w, $consent) {
            app(Wallet::class)->lock($user->id);
            if ($consent->latest($user->id)) return;
            if ($w) app(Wake::class)->stop($user->id);
            app(SyncRetention::class)->purgeUser($user->id);
            app(AccessProjects::class)->purge($user->id);
        }, 5);
        return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
    }
}
