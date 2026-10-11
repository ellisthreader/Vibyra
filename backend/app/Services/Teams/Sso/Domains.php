<?php

namespace App\Services\Teams\Sso;

use App\Models\{Organization, OrganizationSso, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\{Audit, Teams};
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

/**
 * The email-domain claim. An organization's SSO only ever signs in addresses on its VERIFIED domain, and a domain can be verified
 * for one organization only (unique column). Two ways to verify: a DNS TXT record the owner publishes
 * (`_vibyra-verify.{domain}` = `vibyra-verify={token}`), or a manual confirmation by the Vibyra operator after checking out of band
 * (`php artisan vibyra:team-confirm-domain`), recorded in the activity log. A team owner can never confirm their own domain by hand.
 */
final class Domains
{
    /** Shared mailbox providers: nobody can claim these, by DNS or by hand. */
    private const PUBLIC = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com',
        'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com', 'fastmail.com'];

    /** @param Closure(string): array<string>|null $resolver returns the TXT strings at a name; the default asks DNS */
    public function __construct(private readonly ?Closure $resolver = null) {}

    public static function domainOf(string $email): ?string
    {
        $at = strrpos($email, '@');
        return $at === false ? null : self::normalize(substr($email, $at + 1), false);
    }

    public static function normalize(string $domain, bool $strict = true): ?string
    {
        $d = strtolower(trim($domain));
        $ok = strlen($d) <= 253 && preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/D', $d) === 1;
        if (!$ok || ($strict && in_array($d, self::PUBLIC, true))) {
            if ($strict) ApiError::throw(422, 'invalid_domain', 'Enter a company domain you control, such as example.com.');
            return null;
        }
        return $d;
    }

    public static function newToken(): string
    {
        return Str::random(40);
    }

    public static function recordName(string $domain): string
    {
        return config('teams.dns_prefix').'.'.$domain;
    }

    public static function recordValue(OrganizationSso $cfg): string
    {
        return 'vibyra-verify='.$cfg->domain_token;
    }

    /** Look for the owner's TXT record and, when it is there, verify the domain. */
    public function checkDns(OrganizationSso $cfg, Organization $org, User $actor): OrganizationSso
    {
        $records = $this->resolver ? ($this->resolver)(self::recordName($cfg->domain)) : $this->dns(self::recordName($cfg->domain));
        $want = self::recordValue($cfg);
        foreach ($records as $txt) {
            if (is_string($txt) && hash_equals($want, trim($txt))) return $this->verify($cfg, $org, 'dns', $actor->id, $actor);
        }
        ApiError::throw(422, 'dns_not_found', 'We could not find the TXT record yet. DNS can take a few minutes to update.');
    }

    /** Operator-confirmed. `$operator` is a label for the log (an email or name), never an account the team controls. */
    public function confirmManually(OrganizationSso $cfg, Organization $org, string $operator): OrganizationSso
    {
        return $this->verify($cfg, $org, 'manual', null, null, $operator);
    }

    private function verify(OrganizationSso $cfg, Organization $org, string $method, ?int $actorId, ?User $actor, string $operator = ''): OrganizationSso
    {
        return DB::transaction(function () use ($cfg, $org, $method, $actorId, $actor, $operator) {
        Teams::lock($org->id);
        if ($actor) Teams::authorize($actor, 'sso', $org->id);
        $fresh = OrganizationSso::query()->find($org->id);
        if (!$fresh || !hash_equals(Configuration::hash($cfg), Configuration::hash($fresh)))
            ApiError::throw(409, 'sso_changed', 'The SSO configuration changed. Verify the current domain again.');
        $cfg = $fresh;
        try {
            $cfg->forceFill(['verified_domain' => $cfg->domain, 'domain_method' => $method, 'domain_verified_at' => now()])->save();
        } catch (UniqueConstraintViolationException) {
            ApiError::throw(409, 'domain_taken', 'Another team has already verified that domain. Contact support if it is yours.');
        }
        $detail = ['domain' => $cfg->domain, 'method' => $method] + ($operator !== '' ? ['operator' => mb_substr($operator, 0, 60)] : []);
        $ids = \App\Models\OrganizationMember::query()->where('organization_id', $org->id)->where('role', 'owner')->pluck('user_id')->all();
        if ($actorId !== null) {
            Audit::record($actorId, 'team.sso_domain_verified', $org, null, $detail);
            $ids = array_diff($ids, [$actorId]);
        }
        foreach ($ids as $owner) \App\Services\Platform\AccountActivity::record((int) $owner, 'team.sso_domain_verified', ['org' => $org->name] + $detail, 'system');
        return $cfg;
        });
    }

    private function dns(string $name): array
    {
        $out = [];
        foreach (@dns_get_record($name, DNS_TXT) ?: [] as $r) $out[] = (string) ($r['txt'] ?? implode('', (array) ($r['entries'] ?? [])));
        return $out;
    }
}
