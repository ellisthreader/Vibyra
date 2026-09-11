<?php

namespace App\Services\ChatConnectors;

use App\Services\Vibes\AgentTools;
use Illuminate\Support\Facades\DB;

/**
 * Answers the integration half of a parked turn. Project tools wait for the phone;
 * these are the person's own cloud accounts, so this server answers them at once
 * and hands the result back through the same batch the phone uses. A reply that
 * mixes both therefore resumes only when every call has an answer.
 */
class ConnectorRunner
{
    public function __construct(private readonly ConnectorTools $tools, private readonly AgentTools $agent) {}

    public function run(string $turnId, int $userId): void
    {
        $pending = DB::table('vibes_tools')->where('turn_id', $turnId)
            ->whereNotNull('integration')->whereNull('result')->orderBy('created_at')->get();
        foreach ($pending as $row) {
            $outcome = $this->tools->run($userId, $row->integration, $row->operation, (array) json_decode($row->arguments, true));
            DB::table('vibes_tools')->where('id', $row->id)->update(['summary' => $outcome['summary'], 'updated_at' => now()]);
            // `respond` re-queues the turn once nothing is outstanding, so the last
            // answer here is what restarts the model - or the phone's, if one is owed.
            $this->agent->respond($userId, $row->id, 'auto', $outcome['result']);
        }
    }
}
