<?php
namespace App\Services\CloudComputer;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The server makes the account's cloud computer, so nobody has to "set it up". An account that is entitled (Pro or
 * trial, flags on) that agreed on the phone (ConnectConsent) gets its one stopped row the first time its state is read. This only inserts the row: no machine,
 * no volume, no cost until a wake. Failing to create is never an error for the caller: the state simply has no
 * computer and the next read tries again.
 */
final class EnsureComputer
{
    public function __construct(private readonly Computers $computers) {}

    public function ensure(int $user): ?object
    {
        if ($existing = $this->computers->find($user)) return $existing;
        try {
            return $this->computers->create($user, (string) Str::uuid(), null);
        } catch (HttpException|HttpResponseException) {
            return null; // not entitled, flags off, or capacity: the payload reports `enabled` on its own
        }
    }

    /**
     * Whether the terms this account already accepted at signup cover cloud storage and retention, so the first wake
     * needs no extra consent screen. Empty list (the default) means they do not, and the first wake asks as before.
     */
    public function termsCovered(int $user): bool
    {
        $versions = array_filter((array) config('cloud_workspaces.computer_terms_versions', []));
        // Releases without signup legal acceptances have nothing that could cover the cloud terms.
        if (!$versions || !\Illuminate\Support\Facades\Schema::hasTable('legal_acceptances')) return false;
        $accepted = DB::table('legal_acceptances')->where('user_id', $user)->orderByDesc('accepted_at')->value('terms_version');
        return $accepted !== null && in_array($accepted, $versions, true);
    }
}
