<?php
namespace App\Services\AgentWork\Proposals;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Tools\Providers\Schema;

final class ProposalTool
{
    public const NAME = 'propose_work';

    public static function definition(): array
    {
        return Schema::tool(self::NAME,
            'Propose a goal, follow-up, routine or reusable skill for the person to review and explicitly save. '
            .'This only creates a draft; it NEVER starts work, assigns a skill, schedules a task or grants access. '
            .'First call kind="context" without spec to get current server time and existing observed follow-up sources. '
            .'Use only the current teammate and AI runtime. The person must review every instruction. '
            .'Goal spec: {title,expiresAt,milestones:[{key,title,prompt,successCriteria,dependsOn:[]}]} (1–12 ordered steps). '
            .'Followup spec: {title,expiresAt,prompt,condition:{kind:"time",at}}; event/absence require the exact existing '
            .'triggerId, triggerRevision and observed subject (never invent these). Absence means no matching event received by at, '
            .'not certainty about an external service. Dates must be ISO with timezone, future, within 90 days. '
            .'Routine spec: {title,prompt,timezone,recurrence:{type:"once"|"daily"|"weekly",time:"HH:MM",date?,weekdays?},'
            .'catchUpMinutes?:60,overlap?:"skip"}; weekdays 1=Monday. '
            .'Skill spec: {name,instructions,assignToAgent:boolean}. No tools or extra permissions come with skills. '
            .'For a group planning task only, workflow spec: {title,expiresAt,steps:[{key,agentId,title,prompt,successCriteria,dependsOn:[]}],finalCriteria}. '
            .'Use only the selected group members; 1–12 steps with earlier dependencies, expiry within seven days. Source group/context are server supplied. '
            .'Maximum spec 32KB. Draft expires in 7 days. Do not claim that a draft is active.',
            ['kind' => ['type' => 'string', 'enum' => ['context', 'goal', 'followup', 'routine', 'skill', 'workflow']],
                'spec' => ['type' => 'object', 'description' => 'Required for drafts; omitted for context. The complete structured draft described above.']], ['kind']);
    }

    public static function revision(): string { return substr(Canonical::hash(self::definition()), 0, 12); }

    public static function entries(Run $run): array
    {
        if (!config('agents_v2.work_enabled')) return [];
        $d = self::definition();
        return [['tool' => self::NAME, 'connectionId' => $run->id, 'provider' => 'work_proposals', 'account' => null,
            'kind' => 'read', 'requiresApproval' => false, 'schemaRevision' => self::revision(),
            'description' => $d['description'], 'parameters' => $d['parameters']]];
    }
}
