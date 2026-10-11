<?php

namespace App\Console\Commands;

use App\Models\{Organization, OrganizationSso};
use App\Services\Teams\Sso\Domains;
use Illuminate\Console\Command;

/**
 * The manual half of the SSO domain claim: the Vibyra operator checks, out of band, that the team really controls the domain
 * (for a customer that cannot publish a TXT record), then runs this. It is recorded in every owner's activity log. A team owner
 * can never do this for their own team.
 */
class TeamConfirmDomain extends Command
{
    protected $signature = 'vibyra:team-confirm-domain {organization : organization id} {--operator= : who checked, for the log}';
    protected $description = 'Manually confirm that a team controls its SSO email domain (operator only)';

    public function handle(Domains $domains): int
    {
        $org = Organization::query()->find((string) $this->argument('organization'));
        $cfg = $org ? OrganizationSso::query()->find($org->id) : null;
        if (!$org || !$cfg) {
            $this->error('No such organization, or it has not set up SSO.');
            return self::FAILURE;
        }
        $operator = trim((string) $this->option('operator'));
        if ($operator === '') {
            $this->error('Pass --operator=<your name or email> so the confirmation is attributable.');
            return self::FAILURE;
        }
        $this->warn("Confirming {$cfg->domain} for \"{$org->name}\". Only do this after checking they control it.");
        if (!$this->option('no-interaction') && !$this->confirm('Confirm?')) return self::FAILURE;
        try {
            $domains->confirmManually($cfg, $org, $operator);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            $this->error((string) ($e->getResponse()->getData()->error ?? 'Could not confirm.'));
            return self::FAILURE;
        }
        $this->info('Domain confirmed.');
        return self::SUCCESS;
    }
}
