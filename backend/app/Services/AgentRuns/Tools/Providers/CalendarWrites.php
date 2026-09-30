<?php

namespace App\Services\AgentRuns\Tools\Providers;

/**
 * One approved Google Calendar event: exact calendar, title, start, end and
 * timezone, never attendees, `sendUpdates=none`. The event id is derived from
 * the action id, so Google itself deduplicates: a replay answers 409 and the
 * existing event is read back and confirmed instead of created twice.
 */
final class CalendarWrites
{
    public function definition(string $tool): array
    {
        return $tool !== 'google_calendar_create_event' ? [] : Schema::tool($tool, 'Create one event after the person '
            .'approves the exact calendar, title, start, end and timezone. Nobody is invited. Only report it created '
            .'when the result has an id.', ['calendarId' => ['type' => 'string'], 'title' => ['type' => 'string'],
                'start' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
                'end' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
                'timeZone' => ['type' => 'string', 'description' => 'IANA timezone.'], 'description' => ['type' => 'string']],
            ['calendarId', 'title', 'start', 'end', 'timeZone']);
    }

    public function validate(string $tool, array $arguments): array
    {
        abort_unless($tool === 'google_calendar_create_event', 422, 'That Calendar tool is unavailable.');
        Schema::only($arguments, ['calendarId', 'title', 'start', 'end', 'timeZone', 'description']);
        $start = CalendarTools::instant($arguments['start'] ?? null, 'start');
        $end = CalendarTools::instant($arguments['end'] ?? null, 'end');
        abort_unless($end->greaterThan($start) && $start->diffInMinutes($end) <= 1440, 422,
            'The event must end after it starts and last at most one day.');
        return ['calendarId' => CalendarTools::calendarId($arguments['calendarId'] ?? null),
            'title' => Schema::line($arguments['title'] ?? null, 150, 'Give the event a single-line title up to 150 characters.'),
            'start' => $start->toIso8601String(), 'end' => $end->toIso8601String(),
            'timeZone' => CalendarTools::timeZone($arguments['timeZone'] ?? null),
            'description' => (string) Schema::text($arguments['description'] ?? null, 2000, 'The description is too long.', false)];
    }

    public function run(array $a, string $token, string $key): array
    {
        $id = self::eventId($key);
        $url = $this->events($a);
        $response = ProviderHttp::send('Google Calendar', 'google_calendar', true, fn () => ProviderHttp::google($token)
            ->post($url.'?sendUpdates=none', ['id' => $id, 'summary' => $a['title'], 'description' => $a['description'],
                'start' => ['dateTime' => $a['start'], 'timeZone' => $a['timeZone']],
                'end' => ['dateTime' => $a['end'], 'timeZone' => $a['timeZone']]]), [409]);
        if ($response->status() === 409) {
            // Our own id already exists: the first attempt landed. Confirm it matches what was approved.
            $existing = $this->reconcile($a, $token, $key);
            if ($existing) return $existing;
            throw ToolFailure::refused('conflict', 'An event with this id already exists and does not match the approved event.');
        }
        $event = ProviderHttp::json($response, 'Google Calendar', true);
        if (!$this->matches($event, $a, $id)) throw ToolFailure::unknown('Google Calendar');
        return $this->confirmed($event, $a);
    }

    public function reconcile(array $a, string $token, string $key): ?array
    {
        $id = self::eventId($key);
        $response = ProviderHttp::send('Google Calendar', 'google_calendar', false,
            fn () => ProviderHttp::google($token)->get($this->events($a).'/'.$id), [404, 410]);
        if (!$response->successful()) return null;
        $event = ProviderHttp::json($response, 'Google Calendar', false);
        return $this->matches($event, $a, $id) ? [...$this->confirmed($event, $a), 'reconciled' => true] : null;
    }

    /** Google event ids are base32hex (a-v, 0-9); the action UUID's hex digits already are. */
    public static function eventId(string $key): string
    {
        return 'vb'.preg_replace('/[^a-f0-9]/', '', strtolower($key));
    }

    private function events(array $a): string
    {
        return CalendarTools::API.'/calendars/'.rawurlencode($a['calendarId']).'/events';
    }

    private function matches(array $event, array $a, string $id): bool
    {
        $start = $event['start']['dateTime'] ?? null;
        $end = $event['end']['dateTime'] ?? null;
        return ($event['id'] ?? null) === $id && ($event['status'] ?? 'confirmed') !== 'cancelled'
            && ($event['summary'] ?? null) === $a['title'] && is_string($start) && is_string($end)
            && strtotime($start) === strtotime($a['start']) && strtotime($end) === strtotime($a['end'])
            && empty($event['attendees']);
    }

    private function confirmed(array $event, array $a): array
    {
        return ['result' => ['id' => $event['id'], 'calendarId' => $a['calendarId'], 'title' => $a['title'],
            'start' => $event['start']['dateTime'], 'end' => $event['end']['dateTime'], 'timeZone' => $a['timeZone'],
            'url' => $event['htmlLink'] ?? null], 'summary' => 'Created "'.$a['title'].'" on '.$a['calendarId'],
            'resourceId' => $event['id'], 'url' => $event['htmlLink'] ?? null, 'idempotencyKey' => $event['id']];
    }
}
