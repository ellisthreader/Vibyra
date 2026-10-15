<?php

namespace App\Http\Controllers\Privacy;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\AccountActivity;
use App\Services\Privacy\AccountExports;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Roadmap Part 19, the person's side: "Download my data", "Keep run history for" and delete a run's history. The same actions answer
 * on the app bearer session (`/api/account/*`, desktop and phone) and the browser session (`/web-api/account/*`, portal). Each half is
 * 404 while its own flag is off. The signed download is the only route without a session: its link is minted per status read and lives minutes.
 */
final class PrivacyController extends Controller
{
    use UserPayloads;

    public function exportStatus(Request $request, AccountExports $exports)
    {
        $user = $this->requireExport($request);
        return response()->json(['ok' => true, ...$exports->status($user)])->header('Cache-Control', 'no-store');
    }

    public function exportRequest(Request $request, AccountExports $exports)
    {
        $user = $this->requireExport($request);
        $exports->request($user);
        return response()->json(['ok' => true, ...$exports->status($user)], 202)->header('Cache-Control', 'no-store');
    }

    public function download(Request $request, string $export, AccountExports $exports)
    {
        $row = AccountExports::enabled() ? $exports->archive($export) : null;
        if (!$row) ApiError::throw(404, 'export_gone', 'This download has expired. Request your data again from Settings.');
        AccountActivity::record((int) $row->user_id, 'data_export.downloaded', [], 'system');
        return Storage::disk(AccountExports::disk())->download($row->path, 'vibyra-data-export.zip', ['Content-Type' => 'application/zip',
            'Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    private function requireExport(Request $request): User
    {
        if (!AccountExports::enabled()) ApiError::throw(404, 'not_available', 'Data export is not switched on.');
        return $this->person($request);
    }

    /** The browser session on `/web-api`, the app bearer session on `/api`. */
    private function person(Request $request): User
    {
        if ($request->is('web-api/*')) {
            $user = $request->user();
            if (!$user || $user->isGuest()) ApiError::throw(401, 'login_required', 'Please log in.');
            return $user;
        }
        return $this->authenticatedUser($request);
    }
}
