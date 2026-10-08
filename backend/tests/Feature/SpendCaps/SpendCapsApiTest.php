<?php
namespace Tests\Feature\SpendCaps;

use Illuminate\Support\Facades\DB;

class SpendCapsApiTest extends SpendCapsTestCase
{
    public function test_the_server_reports_disabled_and_refuses_writes_while_the_flag_is_off(): void
    {
        config(['spend_caps.enabled' => false]);
        $this->getJson('/api/vibes/spend-caps')->assertOk()->assertExactJson(['spendCaps' => ['enabled' => false]]);
        $this->putJson('/api/vibes/spend-caps', ['day' => 25])->assertNotFound();
        $this->postJson('/api/vibes/spend-caps/raise', ['cap' => 'day'])->assertNotFound();
    }

    public function test_defaults_are_off_with_meters_a_reset_and_the_presets(): void
    {
        $this->getJson('/api/vibes/spend-caps')->assertOk()
            ->assertJsonPath('spendCaps.enabled', true)->assertJsonPath('spendCaps.day.limit', null)
            ->assertJsonPath('spendCaps.month.limit', null)->assertJsonPath('spendCaps.run.limit', null)
            ->assertJsonPath('spendCaps.day.used', 0)->assertJsonPath('spendCaps.alerts', true)
            ->assertJsonPath('spendCaps.presets', [25, 50, 100])->assertJsonPath('spendCaps.day.resetsLabel', '00:00 tomorrow')
            ->assertJsonPath('spendCaps.cloud.whenHoursRunOut', 'default');
    }

    public function test_caps_round_trip_in_tokens_and_a_null_switches_one_off(): void
    {
        $this->putJson('/api/vibes/spend-caps', ['day' => 25, 'month' => 100.5, 'run' => 10, 'timezone' => 'Europe/London'])->assertOk()
            ->assertJsonPath('spendCaps.day.limit', 25)->assertJsonPath('spendCaps.month.limit', 100.5)
            ->assertJsonPath('spendCaps.run.limit', 10)->assertJsonPath('spendCaps.timezone', 'Europe/London');
        $this->assertSame([250_000, 1_005_000, 100_000], array_values((array) DB::table('vibes_wallets')
            ->where('user_id', $this->user->id)->first(['cap_day_units', 'cap_month_units', 'cap_run_units'])));
        $this->putJson('/api/vibes/spend-caps', ['day' => null])->assertOk()
            ->assertJsonPath('spendCaps.day.limit', null)->assertJsonPath('spendCaps.month.limit', 100.5);
    }

    public function test_input_is_validated(): void
    {
        foreach ([['day' => 0], ['day' => -3], ['month' => 'lots'], ['run' => 100001], ['timezone' => 'Mars/Base'], ['cloudIncludedHours' => 'forever']] as $bad) {
            $this->putJson('/api/vibes/spend-caps', $bad)->assertStatus(422);
        }
        $this->assertNull(DB::table('vibes_wallets')->where('user_id', $this->user->id)->value('cap_day_units'));
    }

    public function test_used_follows_spending_and_raise_for_today_is_one_tap_recorded_and_gone_tomorrow(): void
    {
        $this->putJson('/api/vibes/spend-caps', ['day' => 25])->assertOk();
        $this->settle($this->submit(), 100_000);
        $this->getJson('/api/vibes/spend-caps')->assertJsonPath('spendCaps.day.used', 10)->assertJsonPath('spendCaps.month.used', 10);
        $this->postJson('/api/vibes/spend-caps/raise', ['cap' => 'month'])->assertStatus(422);
        $this->postJson('/api/vibes/spend-caps/raise', ['cap' => 'day'])->assertOk()
            ->assertJsonPath('spendCaps.day.limit', 50)->assertJsonPath('spendCaps.day.raisedBy', 25);
        $this->assertNotNull(DB::table('wallet_spend_periods')->where('kind', 'day')->value('raised_at'));
        $this->postJson('/api/vibes/spend-caps/raise', ['cap' => 'day', 'tokens' => 5])->assertJsonPath('spendCaps.day.limit', 55);
        $this->travelTo(now()->addDay()->addMinute());
        $this->getJson('/api/vibes/spend-caps')->assertJsonPath('spendCaps.day.limit', 25)->assertJsonPath('spendCaps.day.used', 0);
    }

    public function test_the_alerts_switch_and_the_cloud_hours_choice_are_saved(): void
    {
        $this->putJson('/api/vibes/spend-caps', ['alerts' => false, 'cloudIncludedHours' => 'stop'])->assertOk()
            ->assertJsonPath('spendCaps.alerts', false)->assertJsonPath('spendCaps.cloud.whenHoursRunOut', 'stop');
        $this->assertSame(0, (int) DB::table('notification_preferences')->where('user_id', $this->user->id)->value('spend'));
        $this->putJson('/api/vibes/spend-caps', ['cloudIncludedHours' => null])->assertJsonPath('spendCaps.cloud.whenHoursRunOut', 'default');
    }

    public function test_the_notification_preferences_route_carries_the_spend_category(): void
    {
        $this->getJson('/api/notifications/v1/preferences')->assertOk()->assertJsonPath('preferences.spend', true);
        $rev = $this->getJson('/api/notifications/v1/preferences')->json('preferences.revision');
        $this->patchJson('/api/notifications/v1/preferences', ['revision' => $rev, 'spend' => false, 'quietStart' => null, 'quietEnd' => null])
            ->assertOk()->assertJsonPath('preferences.spend', false);
    }

    public function test_a_real_quote_is_held_to_the_per_task_limit(): void
    {
        \Illuminate\Support\Facades\Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools', 'max_tokens']]]]);
        $chat = (string) \Illuminate\Support\Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Timer'])->assertOk();
        $ask = fn () => $this->postJson('/api/vibes/quote', ['chatId' => $chat, 'text' => 'Build a timer', 'model' => 'auto'])->assertOk();
        $open = (int) $ask()->json('maximumUnits');
        $this->assertGreaterThan(1, $open);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['cap_run_units' => 1]);
        $this->assertSame('1', $ask()->json('maximumUnits'), 'the smaller of the two ceilings wins');
        config(['spend_caps.enabled' => false]);
        $this->assertSame($open, (int) $ask()->json('maximumUnits'), 'flag off: untouched');
    }
}
