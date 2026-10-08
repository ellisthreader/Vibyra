<?php

namespace App\Services\AgentRuns\Memory;

use App\Models\AgentV2\Run;

/** No extra model call, funding source or interpretation of retrieved documents. */
final class Candidates
{
    public function capture(Run $run): void
    {
        // Only a complete user-authored request or a narrow standalone preference; never extracted document prose.
        $prompt = trim($run->prompt);
        if (preg_match('/\A(?:please\s+)?remember(?:\s+that)?[\s:]+([^\r\n]{1,1000})\z/iu', $prompt, $m)) $fact = trim($m[1]);
        elseif (mb_strlen($prompt) <= 1000 && preg_match('/\A(?:I\s+prefer\s+|My\s+preferred\s+)[^\r\n]+\z/iu', $prompt)) $fact = $prompt;
        else return;
        app(Memories::class)->put((int) $run->user_id, $run->agent_id, Scope::hash($run->runtime_snapshot ?? []),
            ['fact' => $fact, 'sourceKind' => 'user'], $run->id);
    }
}
