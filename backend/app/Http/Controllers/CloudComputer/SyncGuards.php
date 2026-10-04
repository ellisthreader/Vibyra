<?php
namespace App\Http\Controllers\CloudComputer;

use App\Services\CloudComputer\{Computers, ConnectConsent};
use App\Services\CloudWorkspaces\{Eligibility, Runtime};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpKernel\Exception\HttpException;

/** Shared checks for the cloud-sync controllers. Every refusal is {ok:false, code, message, error}. */
trait SyncGuards
{
    /** Pro/trial and the cloud flags; the computer does not need to be running. */
    private function eligible(int $user): void
    {
        try { app(Eligibility::class)->authorize($user); }
        catch (HttpException $e) { Computers::fail('not_eligible', $e->getMessage() ?: 'Cloud sync is not available for this account.', $e->getStatusCode()); }
    }

    /** Eligible and agreed: anything that stores code, logins or a Mac key needs the phone's current "Connect to cloud"
     *  agreement, whichever client asks. Reading state and deleting stay open, so the Mac can learn the answer. */
    private function storing(int $user): void
    {
        $this->eligible($user);
        if (!app(ConnectConsent::class)->connected($user)) Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
    }

    /** The runtime bearer names the workspace; a workspace that is not a cloud computer is refused. */
    private function computerFor(Request $request, string $workspace): object
    {
        $w = app(Runtime::class)->authenticate($workspace, (string) $request->bearerToken());
        abort_unless(($w->kind ?? 'project') === 'computer', 403, 'This workspace is not a cloud computer.');
        return $w;
    }

    private function valid(array $data, array $rules): array
    {
        $v = Validator::make($data, $rules);
        if ($v->fails()) Computers::fail('invalid_request', (string) $v->errors()->first(), 422);
        return $v->validated();
    }

    /** The query of a raw bundle upload, normalised. @return array{kind:string,seq:int,baseSeq:int,head:?string,sha256:string} */
    private function blobQuery(Request $request): array
    {
        $q = $this->valid($request->query(), ['kind' => 'required|in:code,transcripts', 'seq' => 'required|integer|min:1', 'baseSeq' => 'sometimes|integer|min:0',
            'head' => ['sometimes', 'string', 'regex:/^([a-f0-9]{40}|-)$/'], 'sha256' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/']]);
        $q['baseSeq'] = (int) ($q['baseSeq'] ?? 0); $q['seq'] = (int) $q['seq'];
        if ($q['baseSeq'] >= $q['seq']) Computers::fail('invalid_request', 'baseSeq must be lower than seq.', 422);
        $q['head'] = ($q['head'] ?? '-') === '-' ? null : $q['head'];
        return $q;
    }

    private function body(Request $request): array
    {
        $length = $request->header('Content-Length');
        return [$request->getContent(true), is_numeric($length) ? (int) $length : null];
    }
}
