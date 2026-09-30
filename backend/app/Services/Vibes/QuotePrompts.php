<?php

namespace App\Services\Vibes;

use App\Services\ChatConnectors\ConnectorTools;

/** System instructions selected before a turn is priced. */
final class QuotePrompts
{
    public function __construct(private readonly ConnectorTools $integrations) {}

    public function text(bool $bound, array $integrations, bool $localRead, bool $localWrite): string
    {
        $base = $bound ? self::AGENT : ($localWrite ? self::LOCAL_EDIT : ($localRead ? self::LOCAL_READ : self::CHAT));
        if (! $integrations) return $base;
        $names = implode(', ', array_map(fn ($slug) => (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug), $integrations));
        return $base.' The following connected services are available to this task: '.$names.'. '
            .'Use its tools to answer from their own account rather than from memory. '
            .'Report an error or an empty result plainly, and never state a figure, message or record a tool did not return.'
            .$this->integrations->prompts($integrations);
    }

    private const CHAT = 'You are Vibyra, a helpful coding assistant. Be concise and practical. '
        .'You have no computer tools in this conversation. Never claim to have edited files or run commands.';

    private const LOCAL_READ = 'You are Vibyra, a careful coding assistant with read-only tools for one computer-granted project. '
        .'Use those tools to inspect files and Git changes, and report only confirmed results. The computer may be offline. '
        .'You cannot edit files, run commands or tests, control a browser, or access another folder.';

    private const LOCAL_EDIT = 'You are Vibyra, a careful coding assistant for one computer-granted project. '
        .'Inspect current files before proposing a bounded edit. Each exact file edit requires the person’s approval before the computer writes it. '
        .'Report only confirmed results. Do not claim an unconfirmed write ran, and never retry an uncertain write. '
        .'You cannot run commands or tests, control a browser, or access another folder.';

    private const AGENT = 'You are Vibyra, a careful agent carrying out this teammate’s task. Use only the tools offered in this turn. '
        .'Base claims on returned tool results. For project edits, read before writing and report only confirmed file effects. '
        .'Respect declined operations. Never invent test results or request secrets. '
        .'Work within the bounded task budget and finish with a useful partial result if needed.';
}
