<?php
namespace App\Services\AgentChannels;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Canonical,Tools\Providers\Schema};
final class ReplyTool
{
    public const NAME='propose_channel_reply';
    public static function definition(): array
    {
        return Schema::tool(self::NAME,'Draft one plain-text reply to the same verified conversation audience. The owner must review the exact full text and destination in Vibyra. This call cannot choose another audience or bypass approval.',
            ['text'=>['type'=>'string','maxLength'=>4000]],['text']);
    }
    public static function revision(): string{return substr(Canonical::hash(self::definition()),0,12);}
    public static function entry(Run $run): array
    {
        $c=RunContext::context($run);$d=self::definition();
        return ['tool'=>self::NAME,'connectionId'=>$run->id,'provider'=>'channel_reply','account'=>$c['senderLabel']??null,'kind'=>'write','requiresApproval'=>true,
            'schemaRevision'=>self::revision(),'description'=>$d['description'],'parameters'=>$d['parameters']];
    }
    public static function entries(Run $run): array{return RunContext::isolated($run)?[self::entry($run)]:[];}
}
