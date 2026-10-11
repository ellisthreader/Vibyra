<?php
namespace Tests\Support;
use App\Models\{OrganizationMember, User, VibyraSession};
use App\Services\AgentOrganizations\{Definitions, Instances, Policies};
use App\Services\Teams\Organizations;
use Illuminate\Support\Str;
trait AgentOrganisationFixture
{
    use AgentV2Fixture;
    protected object $org;
    protected array $definition;
    protected function bootOrganisation(): void
    {
        $this->bootV2();
        config(['teams.enabled' => true, 'agents_v2.organisation_enabled' => true, 'agents_v2.user_ids' => '*']);
        $this->org = app(Organizations::class)->create($this->user, 'Fixture studio');
        Policies::save($this->user->id, ['expectedRevision' => 0, 'enabled' => true,
            'allowedProviders' => ['gmail', 'github', 'browser', 'computer'], 'dailyTaskLimit' => 25, 'retentionDays' => 90]);
        $this->definition = Definitions::save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0,
            'name' => 'Shared researcher', 'avatar' => 'assistant', 'instructions' => 'Follow the published research process.',
            'knowledge' => 'Company launch date is Friday.']);
        $use = Instances::adopt($this->user->id, $this->definition['id'], 1, $this->definition['reviewHash']);
        $this->agent = app(\App\Services\Agents\Teammates::class)->payload(app(\App\Services\Agents\Teammates::class)->get($this->user->id, $use['agentId']));
    }
    protected function colleague(string $role = 'member'): User
    {
        $u = User::factory()->create();
        OrganizationMember::query()->forceCreate(['organization_id' => $this->org->id, 'user_id' => $u->id, 'role' => $role]);
        VibyraSession::create(['user_id' => $u->id, 'token_hash' => hash('sha256', 'org-user-'.$u->id), 'device_name' => 'Fixture']);
        return $u;
    }
    protected function publish(array $changes = []): array
    {
        return Definitions::save($this->user->id, $this->definition['id'], ['expectedRevision' => $this->definition['revision'],
            'name' => $this->definition['name'], 'avatar' => 'assistant', 'instructions' => $this->definition['instructions'],
            'knowledge' => $this->definition['knowledge'], ...$changes]);
    }
}
