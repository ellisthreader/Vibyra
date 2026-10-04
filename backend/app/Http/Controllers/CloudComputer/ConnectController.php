<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{AccessProjects, Computers, ConnectConsent, FaceKeys, SyncRetention, Wake};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Support\Str;

/** POST /api/cloud-computer/connect: the phone's "Connect to cloud" agreement. Makes the computer, then records the consent.
 *  DELETE withdraws it: the computer is stopped, every synced project, conversation and login copy is deleted, and the
 *  computer's disk is removed as soon as it has stopped. */
final class ConnectController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $request, Computers $computers, ConnectConsent $consent, FaceKeys $faces)
    {
        $session = $this->authenticatedSession($request);
        $user = $this->authenticatedUser($request); app(Wallet::class)->ensure($user);
        $v = Validator::make($request->all(), ['accept' => 'required|accepted', 'consentVersion' => 'required|integer|min:1']);
        if ($v->fails()) Computers::fail('invalid_request', 'Tick the box to agree before connecting.', 422);
        $picked = $this->picked($request);
        if ((int) $request->input('consentVersion') !== $consent->current()) {
            Computers::fail('consent_outdated', 'The cloud terms changed. Read them again to connect.', 409, ['current' => $consent->current()]);
        }
        // The person, with their face, on the phone they signed in on: a stolen session token cannot agree for them.
        if ($faces->required()) $faces->verify($session, $request->input('face'));
        $w = $computers->create($user->id, (string) Str::uuid(), 'Cloud'); // refuses a non-entitled account before any consent is kept
        $consent->record($user->id, $consent->current(), 'phone', $request);
        if ($picked) app(AccessProjects::class)->decide($user->id, $picked, 'phone'); // the projects ticked on the connect page
        // The connect text covers the cloud terms, so the first wake needs no extra terms sheet.
        DB::table('cloud_workspaces')->where('id', $w->id)->whereNull('terms_accepted_at')->update(['terms_accepted_at' => now(), 'updated_at' => now()]);
        return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
    }

    /** Optional `projects:[{id, name}]` (at most 100), checked before anything is stored. */
    private function picked(Request $request): array
    {
        if (!$request->has('projects')) return [];
        $v = Validator::make($request->all(), ['projects' => 'array|max:'.AccessProjects::MAX_ITEMS, 'projects.*' => 'required|array',
            'projects.*.id' => 'required|string|min:1|max:255', 'projects.*.name' => 'required|string|max:120']);
        if ($v->fails()) Computers::fail('invalid_request', (string) $v->errors()->first(), 422);
        return AccessController::items($v->validated()['projects'] ?? [], true);
    }

    public function revoke(Request $request, Computers $computers, ConnectConsent $consent)
    {
        $user = $this->authenticatedUser($request);
        // Same lock as Wake, so a wake already past its consent check finishes first and is then stopped here, and a later
        // one sees the withdrawal.
        $w = DB::transaction(function () use ($user, $consent, $computers) {
            app(Wallet::class)->lock($user->id);
            $consent->revoke($user->id);
            $w = $computers->find($user->id);
            if ($w) DB::table('cloud_computer_projects')->where('workspace_id', $w->id)->delete(); // queued clones are not redone
            return $w;
        }, 5);
        // Shutdown does nothing for a computer already asleep; once stopped, Retention removes its disk without the usual wait.
        if ($w) app(Wake::class)->stop($user->id);
        app(SyncRetention::class)->purgeUser($user->id);
        app(AccessProjects::class)->purge($user->id);
        return $this->json(['ok' => true] + $computers->payload($user->id))->header('Cache-Control', 'private, no-store');
    }
}
