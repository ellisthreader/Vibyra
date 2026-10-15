<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{Computers, ConnectConsent};
use App\Services\CloudComputer\Owners\{ConversationOwners, OwnerInput};
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;

/**
 * Who writes a conversation, the PC or Vibyra Cloud (docs/cloud-switching-contract.md section 1). Every row belongs to
 * the signed-in account; the response never carries another account's conversation or any message content.
 */
final class OwnerController extends Controller
{
    use UserPayloads, SyncGuards;

    /** GET /owners?project=<name>: `{ok, owners:[{provider,id,project,owner,generation,title,updatedAt}]}`. */
    public function index(Request $request, ConversationOwners $owners)
    {
        $user = $this->authenticatedUser($request)->id;
        $d = $this->valid($request->query(), ['project' => ['sometimes', 'string', 'regex:'.\App\Services\CloudComputer\Projects::NAME]]);
        return response()->json(['ok' => true, 'owners' => $owners->list($user, $d['project'] ?? null)])->header('Cache-Control', 'private, no-store');
    }

    /** PUT /owners/{provider}/{id} `{project, to: pc|cloud, generation, title?}`: compare-and-set. */
    public function update(Request $request, string $provider, string $id, ConversationOwners $owners)
    {
        $user = $this->authenticatedUser($request)->id;
        if (!OwnerInput::provider($provider)) Computers::fail('invalid_request', 'Unknown provider.', 422);
        if (!OwnerInput::id($id)) Computers::fail('invalid_request', 'Invalid conversation id.', 422);
        $d = $this->valid($request->all(), ['project' => ['required', 'string', 'regex:'.\App\Services\CloudComputer\Projects::NAME], 'to' => 'required|in:pc,cloud',
            'generation' => 'required|integer|min:0|max:2147483646', 'title' => 'sometimes|nullable|string|max:500']);
        if ($d['to'] === 'cloud') {
            // Moving in needs Cloud itself: an eligible, agreed account. The project's opt-in is checked by `set`, under the account lock.
            $this->storing($user);
        } elseif (!app(ConnectConsent::class)->connected($user)) {
            // Coming back to the PC needs no plan (a lapsed account must still get its work home), only a record to move.
            Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
        }
        [$applied, $row] = $owners->set($user, $provider, $id, $d['project'], $d['to'], (int) $d['generation'], OwnerInput::clip($d['title'] ?? null));
        if (!$applied) {
            // `error` is the code here (the contract names it); the usual `code` and `message` ride along.
            throw new HttpResponseException(response()->json(['ok' => false, 'error' => 'owner_changed', 'code' => 'owner_changed',
                'message' => 'This conversation moved while you were deciding. Check where it is now.', 'current' => $row], 409));
        }
        return response()->json(['ok' => true] + $row)->header('Cache-Control', 'private, no-store');
    }
}
