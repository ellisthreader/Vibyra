<?php
namespace App\Services\Decisions;
use App\Jobs\ClassifyDecision;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
final class ShadowRouting
{
    public function submitted(int $user, array $q): void
    {
        $agent = isset($q['request']['vibyraAgent']);
        if (config('intelligence.jev_mode') !== 'shadow' || ($q['selection'] ?? null) !== 'auto'
            || !config($agent ? 'intelligence.auto_teammate' : 'intelligence.auto_work')
            || !DB::table('notification_preferences')->where('user_id', $user)->value('smart')) return;
        $id = (string) Str::uuid();
        DB::table('ai_decisions')->insert(['id' => $id, 'user_id' => $user, 'purpose' => 'shadow',
            'fingerprint' => hash('sha256', json_encode($q)), 'deadline' => now()->addSeconds(30),
            'input' => Crypt::encryptString(json_encode(['agent' => $agent, 'state' => ['request' => \App\Services\Vibes\Auto\RoutingPrompt::from($q['text'], $q['request']['messages'])]])),
            'created_at' => now(), 'updated_at' => now()]);
        ClassifyDecision::dispatch($id)->afterCommit();
    }
}
