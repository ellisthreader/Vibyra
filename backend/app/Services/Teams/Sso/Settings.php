<?php

namespace App\Services\Teams\Sso;

use App\Models\{Organization, OrganizationSso, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\{Audit, Teams};
use Illuminate\Support\Facades\{Crypt, DB};

/**
 * An organization's OIDC settings, owner only. The client secret is encrypted with the app key, accepted on write and never
 * returned. Changing the issuer, client or domain switches SSO off again; enabling needs a verified domain; "require SSO" needs
 * SSO enabled. Discovery is fetched when settings are saved, so a wrong issuer is refused at once instead of at someone's sign-in.
 */
final class Settings
{
    public function __construct(private readonly Discovery $discovery, private readonly Domains $domains) {}

    public static function redirectUri(): string
    {
        return url('/auth/sso/callback');
    }

    public function payload(Organization $org): array
    {
        $c = OrganizationSso::query()->find($org->id);
        $base = ['visible' => true, 'redirectUri' => self::redirectUri(), 'configured' => $c !== null];
        if (!$c) return $base;
        return $base + ['issuer' => $c->issuer, 'clientId' => $c->client_id, 'hasSecret' => true, 'domain' => $c->domain,
            'domainVerified' => $c->verified_domain !== null, 'domainMethod' => $c->domain_method,
            'dns' => $c->verified_domain === null ? ['name' => Domains::recordName($c->domain), 'type' => 'TXT', 'value' => Domains::recordValue($c)] : null,
            'enabled' => $c->enabled, 'requireSso' => $c->require_sso];
    }

    /** @param array{issuer:string,clientId:string,clientSecret?:?string,domain:string} $in */
    public function save(User $actor, array $in): OrganizationSso
    {
        $a = Teams::authorize($actor, 'sso');
        $issuer = trim($in['issuer']);
        $domain = Domains::normalize($in['domain']);
        try {
            $this->discovery->get($issuer, true);
        } catch (SsoException $e) {
            ApiError::throw(422, 'sso_provider', $e->getMessage());
        }
        $secret = trim((string) ($in['clientSecret'] ?? ''));
        return DB::transaction(function () use ($a, $in, $issuer, $domain, $secret) {
            $org = Teams::lock($a->organization_id);
            Teams::current($a, 'sso');
            $c = OrganizationSso::query()->find($org->id);
            if (!$c && $secret === '') ApiError::throw(422, 'secret_required', 'Enter the client secret from your identity provider.');
            $c ??= (new OrganizationSso)->forceFill(['organization_id' => $org->id, 'domain_token' => Domains::newToken()]);
            $changed = !$c->exists || $c->issuer !== $issuer || $c->client_id !== trim($in['clientId']) || $secret !== '' || $c->domain !== $domain;
            $c->forceFill(['issuer' => $issuer, 'client_id' => trim($in['clientId']), 'domain' => $domain]);
            if ($secret !== '') $c->forceFill(['client_secret' => Crypt::encryptString($secret)]);
            if ($c->isDirty('domain') || !$c->exists) $c->forceFill(['verified_domain' => null, 'domain_method' => null, 'domain_verified_at' => null, 'domain_token' => Domains::newToken()]);
            if ($changed) $c->forceFill(['enabled' => false, 'require_sso' => false]);
            $c->save();
            Audit::record($a->user_id, 'team.sso_configured', $org, null, ['issuer' => $issuer, 'domain' => $domain]);
            return $c;
        });
    }

    public function verifyDomain(User $actor): OrganizationSso
    {
        $a = Teams::authorize($actor, 'sso');
        $org = Organization::query()->findOrFail($a->organization_id);
        $c = OrganizationSso::query()->find($org->id) ?? ApiError::throw(404, 'sso_not_configured', 'Set up SSO first.');
        return $this->domains->checkDns($c, $org, $actor);
    }

    public function enable(User $actor, bool $enabled, bool $require): OrganizationSso
    {
        $a = Teams::authorize($actor, 'sso');
        return DB::transaction(function () use ($a, $enabled, $require) {
            $org = Teams::lock($a->organization_id);
            Teams::current($a, 'sso');
            $c = OrganizationSso::query()->find($org->id) ?? ApiError::throw(404, 'sso_not_configured', 'Set up SSO first.');
            if ($enabled && $c->verified_domain === null) ApiError::throw(409, 'domain_unverified', 'Verify your domain before turning SSO on.');
            $require = $enabled && $require;
            $was = [$c->enabled, $c->require_sso];
            $c->forceFill(['enabled' => $enabled, 'require_sso' => $require])->save();
            if ($was[0] !== $enabled) Audit::record($a->user_id, $enabled ? 'team.sso_enabled' : 'team.sso_disabled', $org);
            if ($was[1] !== $require) Audit::record($a->user_id, 'team.sso_required', $org, null, ['required' => $require]);
            return $c;
        });
    }

    public function remove(User $actor): void
    {
        $a = Teams::authorize($actor, 'sso');
        DB::transaction(function () use ($a) {
            $org = Teams::lock($a->organization_id);
            Teams::current($a, 'sso');
            if (OrganizationSso::query()->whereKey($org->id)->delete()) {
                DB::table('organization_sso_identities')->where('organization_id', $org->id)->delete();
                Audit::record($a->user_id, 'team.sso_removed', $org);
            }
        });
    }
}
