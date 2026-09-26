<?php
namespace App\Services\Decisions;
use Illuminate\Support\Facades\DB;
final class DecisionEligibility
{
    public static function allows(object $decision, array $input): bool
    {
        $mode = config('intelligence.jev_mode');
        if (!in_array($mode, ['shadow','active']) ||
            !DB::table('notification_preferences')->where('user_id', $decision->user_id)->value('smart')) return false;
        if ($decision->purpose === 'progress') return in_array(config('intelligence.progress_mode'), ['shadow','advisory']);
        if ($decision->purpose === 'routing') {
            if ($mode !== 'active' || ($input['quote']['selection'] ?? null) !== 'auto') return false;
            $agent = isset($input['quote']['request']['vibyraAgent']);
        } elseif ($decision->purpose === 'shadow') {
            if ($mode !== 'shadow' || !is_bool($input['agent'] ?? null)) return false;
            $agent = $input['agent'];
        } else return false;
        return (bool) config($agent ? 'intelligence.auto_teammate' : 'intelligence.auto_work');
    }
}
