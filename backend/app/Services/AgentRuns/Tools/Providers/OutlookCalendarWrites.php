<?php

namespace App\Services\AgentRuns\Tools\Providers;

/**
 * One approved Outlook event: exact calendar, title, start, end and timezone,
 * never attendees (so Outlook sends no invitations). `transactionId` is the action
 * id, which Graph uses to drop a repeated create; after an unconfirmed create one
 * read of the event window finds the event by that transactionId instead.
 * Times are sent in UTC and reported in the approved timezone.
 */
final class OutlookCalendarWrites
{
    public function definition(string $tool): array
    {
        return $tool !== 'outlook_calendar_create_event' ? [] : Schema::tool($tool, 'Create one Outlook event after the person '
            .'approves the exact calendar, title, start, end and timezone. Nobody is invited. Only report it created when the '
            .'result has an id.', ['calendarId' => ['type' => 'string', 'description' => '"primary" or an exact calendar id.'],
                'title' => ['type' => 'string'], 'start' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
                'end' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
                'timeZone' => ['type' => 'string', 'description' => 'IANA timezone.'], 'description' => ['type' => 'string']],
            ['calendarId', 'title', 'start', 'end', 'timeZone']);
    }

    public function validate(string $tool, array $a): array
    {
        abort_unless($tool === 'outlook_calendar_create_event', 422, 'That Outlook Calendar tool is unavailable.');
        Schema::only($a, ['calendarId', 'title', 'start', 'end', 'timeZone', 'description']);
        $start = CalendarTools::instant($a['start'] ?? null, 'start');
        $end = CalendarTools::instant($a['end'] ?? null, 'end');
        abort_unless($end->greaterThan($start) && $start->diffInMinutes($end) <= 1440, 422,
            'The event must end after it starts and last at most one day.');
        return ['calendarId' => OutlookCalendarTools::calendarId($a['calendarId'] ?? null),
            'title' => Schema::line($a['title'] ?? null, 150, 'Give the event a single-line title up to 150 characters.'),
            'start' => $start->toIso8601String(), 'end' => $end->toIso8601String(),
            'timeZone' => CalendarTools::timeZone($a['timeZone'] ?? null),
            'description' => (string) Schema::text($a['description'] ?? null, 2000, 'The description is too long.', false)];
    }

    public function run(GraphApi $graph, array $a, string $token, string $key): array
    {
        $response = $graph->post($token, OutlookCalendarTools::path($a['calendarId']).'/events', ['subject' => $a['title'],
            'body' => ['contentType' => 'Text', 'content' => $a['description']],
            'start' => ['dateTime' => OutlookCalendarTools::utc($a['start']), 'timeZone' => 'UTC'],
            'end' => ['dateTime' => OutlookCalendarTools::utc($a['end']), 'timeZone' => 'UTC'],
            'attendees' => [], 'isOnlineMeeting' => false, 'transactionId' => self::transactionId($key)]);
        $event = $graph->json($response, true);
        if (!$this->matches($event, $a, $key)) throw ToolFailure::unknown('Outlook Calendar');
        return $this->confirmed($event, $a, $key);
    }

    public function reconcile(GraphApi $graph, array $a, string $token, string $key): ?array
    {
        $body = $graph->get($token, OutlookCalendarTools::path($a['calendarId']).'/calendarView', ['startDateTime' => $a['start'],
            'endDateTime' => $a['end'], '$top' => 50, '$select' => 'id,subject,start,end,attendees,isCancelled,webLink,transactionId']);
        foreach ($body['value'] ?? [] as $event)
            if (is_array($event) && $this->matches($event, $a, $key, true)) return $this->confirmed($event, $a, $key);
        return null;
    }

    /** Graph accepts any client string; the normalised action id keeps it stable per action. */
    public static function transactionId(string $key): string
    {
        return 'vibyra-'.preg_replace('/[^a-f0-9-]/', '', strtolower($key));
    }

    /** Reconciliation is strict (our transactionId must be echoed); a fresh create may omit it. */
    private function matches(array $event, array $a, string $key, bool $strict = false): bool
    {
        $transaction = $event['transactionId'] ?? null;
        return is_string($event['id'] ?? null) && ($transaction === self::transactionId($key) || (!$strict && $transaction === null))
            && !($event['isCancelled'] ?? false) && ($event['subject'] ?? null) === $a['title']
            && self::at((array) ($event['start'] ?? [])) === strtotime($a['start'])
            && self::at((array) ($event['end'] ?? [])) === strtotime($a['end']) && empty($event['attendees']);
    }

    private static function at(array $value): ?int
    {
        if (!is_string($value['dateTime'] ?? null)) return null;
        try { return \Carbon\CarbonImmutable::parse($value['dateTime'], $value['timeZone'] ?? 'UTC')->getTimestamp(); }
        catch (\Throwable) { return null; }
    }

    private function confirmed(array $event, array $a, string $key): array
    {
        $url = is_string($event['webLink'] ?? null) ? $event['webLink'] : null;
        return ['result' => ['id' => $event['id'], 'calendarId' => $a['calendarId'], 'title' => $a['title'], 'start' => $a['start'],
            'end' => $a['end'], 'timeZone' => $a['timeZone'], 'url' => $url],
            'summary' => 'Created "'.$a['title'].'" on Outlook '.$a['calendarId'], 'resourceId' => $event['id'], 'url' => $url,
            'idempotencyKey' => self::transactionId($key)];
    }
}
