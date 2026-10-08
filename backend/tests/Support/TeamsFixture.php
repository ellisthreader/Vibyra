<?php

namespace Tests\Support;

use App\Models\{Organization, OrganizationMember, User};
use App\Notifications\TeamInvitation;
use App\Services\Mcp\EndpointPolicy;
use Illuminate\Support\Facades\{DB, Notification};

/** Shared setup for the Teams tests (roadmap Part 13): the flags on, a public-looking address for the mock IdP, people and teams. */
trait TeamsFixture
{
    protected function bootTeams(): void
    {
        config(['teams.enabled' => true, 'platform.activity' => true, 'spend_caps.enabled' => true]);
        $this->app->instance(EndpointPolicy::class, new EndpointPolicy(fn () => ['93.184.216.34']));
    }

    protected function person(?string $email = null, array $extra = []): User
    {
        return User::factory()->create($extra + ['email' => $email ?? fake()->unique()->safeEmail(), 'email_verified_at' => now()]);
    }

    /** A team with its owner, optionally with admins and members, written straight to the tables. */
    protected function team(?User $owner = null, string $name = 'Acme'): array
    {
        $owner ??= $this->person();
        $org = (new Organization)->forceFill(['name' => $name]);
        $org->save();
        $this->seat($org, $owner, 'owner');
        return [$org, $owner];
    }

    protected function seat(Organization $org, User $user, string $role = 'member'): OrganizationMember
    {
        $m = (new OrganizationMember)->forceFill(['organization_id' => $org->id, 'user_id' => $user->id, 'role' => $role, 'joined_via' => 'invite']);
        $m->save();
        return $m;
    }

    protected function memberOf(User $user): ?OrganizationMember
    {
        return OrganizationMember::query()->where('user_id', $user->id)->first();
    }

    /** The invitation link's secret, read from the email that was sent to `$email`. */
    protected function inviteToken(string $email): string
    {
        $found = null;
        Notification::assertSentOnDemand(TeamInvitation::class, function (TeamInvitation $n, array $channels, $notifiable) use ($email, &$found) {
            if ($notifiable->routes['mail'] !== $email) return false;
            $url = $n->toMail($notifiable)->actionUrl;
            $this->assertStringContainsString('/team/join#token=', $url);
            $found = substr($url, strpos($url, '#token=') + 7);
            return true;
        });
        return $found;
    }

    protected function events(User $user, ?string $event = null): array
    {
        return DB::table('account_audit_events')->where('user_id', $user->id)->when($event, fn ($q) => $q->where('event', $event))->orderBy('id')->get()
            ->map(fn ($e) => ['event' => $e->event, 'actor' => $e->actor, 'detail' => json_decode($e->detail ?? '[]', true)])->all();
    }
}
