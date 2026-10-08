<?php
namespace App\Services\AgentWork\Signals;
use App\Services\AgentRuns\Tools\Providers\{ProviderHttp,ToolFailure};
use Carbon\CarbonImmutable;
/** Read-only GitHub metadata. Provider text/body/URLs are never instructions or authority. */
final class GithubEvidence
{
    public function read(string $repository,string $token,callable $valid): array
    {
        $base='https://api.github.com/repos/'.implode('/',array_map('rawurlencode',explode('/',$repository)));
        $list=$this->get($base.'/pulls',$token,['state'=>'all','sort'=>'updated','direction'=>'desc','per_page'=>30],$valid);
        if (!array_is_list($list)) throw ToolFailure::retryable('GitHub returned an unreadable list.');
        $result=[]; $inspected=0;
        foreach (array_slice($list,0,30) as $raw) {
            $p=$this->fact($raw,$repository); if (!$p) throw ToolFailure::retryable('GitHub returned invalid repository evidence.');
            if ($p['state']==='open' && $inspected<5) {
                $inspected++; $detail=$this->get($base.'/pulls/'.$p['number'],$token,[],$valid);
                $confirmed=$this->fact($detail,$repository);
                if (!$confirmed || $confirmed['number']!==$p['number']) throw ToolFailure::retryable('GitHub returned a different pull request.');
                $p=$confirmed;
            }
            $result[(string)$p['number']]=$p;
        }
        return $result;
    }
    private function get(string $url,string $token,array $query,callable $valid): array
    {
        if (!$valid()) throw ToolFailure::refused('access_changed','Discovery access changed.');
        $r=ProviderHttp::send('GitHub','github',false,fn()=>ProviderHttp::github($token)->timeout(8)->get($url,$query));
        return ProviderHttp::json($r,'GitHub',false);
    }
    private function fact(mixed $raw,string $repository): ?array
    {
        if (!is_array($raw) || !is_int($raw['number']??null) || $raw['number']<1 || !in_array($raw['state']??null,['open','closed'],true)
            || !is_string($raw['updated_at']??null)) return null;
        // GitHub reports the base repo on both list and detail. Reject mismatched evidence.
        if (strcasecmp((string)($raw['base']['repo']['full_name']??''),$repository)!==0) return null;
        try { $updated=CarbonImmutable::parse($raw['updated_at']); } catch (\Throwable) { return null; }
        if ($updated->greaterThan(now()->addMinute())) return null;
        return ['number'=>$raw['number'],'state'=>$raw['state'],'merged'=>($raw['merged']??false)===true || is_string($raw['merged_at']??null),
            'draft'=>($raw['draft']??false)===true,'mergeable'=>is_bool($raw['mergeable']??null)?$raw['mergeable']:null,
            'updatedAt'=>$updated->toIso8601String()];
    }
}
