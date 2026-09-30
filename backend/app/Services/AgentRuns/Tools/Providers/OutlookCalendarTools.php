<?php

namespace App\Services\AgentRuns\Tools\Providers;

/**
 * Outlook Calendar for Agent V2: list calendars, list events in an explicit window
 * and timezone (calendarView), free/busy through getSchedule, and one approved
 * event creation (`OutlookCalendarWrites`). Every call names its calendar;
 * "primary" means the account's default calendar and nothing else.
 */
final class OutlookCalendarTools implements ProviderTools
{
    public readonly GraphApi $graph;

    public function __construct(private readonly OutlookCalendarWrites $writes)
    {
        $this->graph = new GraphApi('Outlook Calendar', 'outlook_calendar');
    }

    public function tools(): array
    {
        return ['outlook_calendar_list_calendars' => 'read', 'outlook_calendar_list_events' => 'read',
            'outlook_calendar_freebusy' => 'read', 'outlook_calendar_create_event' => 'write'];
    }

    public function definition(string $tool): array
    {
        $window = ['timeMin' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
            'timeMax' => ['type' => 'string', 'description' => 'RFC3339 with offset; at most 31 days after timeMin.'],
            'timeZone' => ['type' => 'string', 'description' => 'IANA timezone for the answer, e.g. Europe/London.']];
        $calendar = ['calendarId' => ['type' => 'string', 'description' => '"primary" or an id from outlook_calendar_list_calendars.']];
        return match ($tool) {
            'outlook_calendar_list_calendars' => Schema::tool($tool, 'List the Outlook calendars this account can see, with ids, '
                .'owner and whether they can be edited.', ['pageToken' => ['type' => 'string']]),
            'outlook_calendar_list_events' => Schema::tool($tool, 'List events on one Outlook calendar inside a time window, '
                .'in a timezone. Follow nextPageToken before claiming the window is complete.', $calendar + $window
                + ['pageToken' => ['type' => 'string'], 'maxResults' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50]],
                ['calendarId', 'timeMin', 'timeMax', 'timeZone']),
            'outlook_calendar_freebusy' => Schema::tool($tool, 'Busy intervals for up to 5 people or rooms (email addresses, '
                .'including this account) inside a time window.', ['schedules' => ['type' => 'array', 'items' => ['type' => 'string'],
                    'minItems' => 1, 'maxItems' => 5]] + $window, ['schedules', 'timeMin', 'timeMax', 'timeZone']),
            default => $this->writes->definition($tool),
        };
    }

    public function validate(string $tool, array $a): array
    {
        if ($tool === 'outlook_calendar_list_calendars') {
            Schema::only($a, ['pageToken']);
            return array_filter(['pageToken' => GraphApi::page($a)]);
        }
        if ($tool === 'outlook_calendar_list_events') {
            Schema::only($a, ['calendarId', 'timeMin', 'timeMax', 'timeZone', 'pageToken', 'maxResults']);
            $max = $a['maxResults'] ?? 25;
            abort_unless(is_int($max) && $max >= 1 && $max <= 50, 422, 'Choose 1 to 50 events per page.');
            return array_filter(['calendarId' => self::calendarId($a['calendarId'] ?? null)] + self::window($a)
                + ['pageToken' => GraphApi::page($a), 'maxResults' => $max], fn ($v) => $v !== null);
        }
        if ($tool === 'outlook_calendar_freebusy') {
            Schema::only($a, ['schedules', 'timeMin', 'timeMax', 'timeZone']);
            $who = $a['schedules'] ?? null;
            abort_unless(is_array($who) && array_is_list($who) && count($who) >= 1 && count($who) <= 5, 422, 'Choose 1 to 5 email addresses.');
            foreach ($who as $email) abort_unless(\App\Services\ChatConnectors\Recipient::valid($email),
                422, 'Each schedule must be one email address.');
            return ['schedules' => array_values(array_unique(array_map('strtolower', $who)))] + self::window($a);
        }
        return $this->writes->validate($tool, $a);
    }

    public function run(string $tool, array $a, string $token, string $key): array
    {
        return match ($tool) {
            'outlook_calendar_list_calendars' => $this->calendars($a, $token),
            'outlook_calendar_list_events' => $this->events($a, $token),
            'outlook_calendar_freebusy' => $this->freebusy($a, $token),
            default => $this->writes->run($this->graph, $a, $token, $key),
        };
    }

    public function reconcile(string $tool, array $a, string $token, string $key): ?array
    {
        return $tool === 'outlook_calendar_create_event' ? $this->writes->reconcile($this->graph, $a, $token, $key) : null;
    }

    private function calendars(array $a, string $token): array
    {
        $body = $this->graph->get($token, '/me/calendars', ['$top' => 50, '$select' => 'id,name,canEdit,isDefaultCalendar,owner']
            + GraphApi::restore($a['pageToken'] ?? null));
        $rows = array_map(fn ($c) => ['id' => $c['id'] ?? null, 'name' => mb_substr((string) ($c['name'] ?? ''), 0, 200),
            'primary' => (bool) ($c['isDefaultCalendar'] ?? false), 'canEdit' => (bool) ($c['canEdit'] ?? false),
            'owner' => $c['owner']['address'] ?? null], array_slice($body['value'] ?? [], 0, 50));
        return ['result' => ['calendars' => $rows] + GraphApi::paging($body), 'summary' => 'Listed '.count($rows).' Outlook calendars'];
    }

    private function events(array $a, string $token): array
    {
        $body = $this->graph->get($token, self::path($a['calendarId']).'/calendarView', ['startDateTime' => $a['timeMin'],
            'endDateTime' => $a['timeMax'], '$top' => $a['maxResults'], '$orderby' => 'start/dateTime',
            '$select' => 'id,subject,start,end,isAllDay,showAs,isCancelled,location,webLink'] + GraphApi::restore($a['pageToken'] ?? null),
            ['Prefer' => 'outlook.timezone="'.$a['timeZone'].'"']);
        $rows = array_map(fn ($e) => ['id' => $e['id'] ?? null, 'title' => mb_substr((string) ($e['subject'] ?? '(untitled)'), 0, 250),
            'start' => $e['start']['dateTime'] ?? null, 'end' => $e['end']['dateTime'] ?? null, 'allDay' => (bool) ($e['isAllDay'] ?? false),
            'cancelled' => (bool) ($e['isCancelled'] ?? false), 'busy' => !in_array($e['showAs'] ?? 'busy', ['free', 'unknown'], true),
            'location' => $e['location']['displayName'] ?? null, 'url' => $e['webLink'] ?? null], array_slice($body['value'] ?? [], 0, 50));
        return ['result' => ['calendarId' => $a['calendarId'], 'timeZone' => $a['timeZone'], 'events' => $rows] + GraphApi::paging($body),
            'summary' => 'Read '.count($rows).' Outlook events'];
    }

    private function freebusy(array $a, string $token): array
    {
        $zone = ['timeZone' => 'UTC'];
        $body = $this->graph->query($token, '/me/calendar/getSchedule', ['schedules' => $a['schedules'],
            'startTime' => ['dateTime' => self::utc($a['timeMin'])] + $zone, 'endTime' => ['dateTime' => self::utc($a['timeMax'])] + $zone,
            'availabilityViewInterval' => 30]);
        $bySchedule = collect($body['value'] ?? [])->keyBy(fn ($s) => strtolower((string) ($s['scheduleId'] ?? '')));
        $rows = [];
        foreach ($a['schedules'] as $email) {
            $entry = $bySchedule->get($email);
            $busy = array_values(array_filter($entry['scheduleItems'] ?? [], fn ($i) => in_array($i['status'] ?? 'busy', ['busy', 'oof', 'tentative', 'workingElsewhere'], true)));
            $rows[] = ['schedule' => $email, 'busy' => array_map(fn ($i) => ['start' => self::zoned($i['start'] ?? [], $a['timeZone']),
                'end' => self::zoned($i['end'] ?? [], $a['timeZone']), 'status' => $i['status'] ?? null], array_slice($busy, 0, 200)),
                'error' => $entry === null ? 'missing' : (is_array($entry['error'] ?? null) ? mb_substr((string) ($entry['error']['message'] ?? 'unavailable'), 0, 200) : null)];
        }
        return ['result' => ['timeMin' => $a['timeMin'], 'timeMax' => $a['timeMax'], 'timeZone' => $a['timeZone'], 'schedules' => $rows],
            'summary' => 'Checked free/busy for '.count($rows).' schedules'];
    }

    public static function path(string $calendarId): string
    {
        return $calendarId === 'primary' ? '/me/calendar' : '/me/calendars/'.rawurlencode($calendarId);
    }

    public static function calendarId(mixed $id): string
    {
        return $id === 'primary' ? 'primary' : GraphApi::id($id, 'Use "primary" or an exact calendar id from outlook_calendar_list_calendars.',
            '/^[A-Za-z0-9_+\/=-]{20,500}$/D');
    }

    public static function utc(string $instant): string
    {
        return CalendarTools::instant($instant, 'time')->utc()->format('Y-m-d\TH:i:s');
    }

    /** A Graph dateTimeTimeZone (UTC here) rendered as RFC3339 in the asked timezone. */
    private static function zoned(array $value, string $zone): ?string
    {
        if (!is_string($value['dateTime'] ?? null)) return null;
        try { return \Carbon\CarbonImmutable::parse($value['dateTime'], $value['timeZone'] ?? 'UTC')->setTimezone($zone)->toIso8601String(); }
        catch (\Throwable) { return null; }
    }

    /** @return array{timeMin: string, timeMax: string, timeZone: string} */
    private static function window(array $a): array
    {
        $min = CalendarTools::instant($a['timeMin'] ?? null, 'timeMin');
        $max = CalendarTools::instant($a['timeMax'] ?? null, 'timeMax');
        abort_unless($max->greaterThan($min) && $min->diffInDays($max) <= 31, 422, 'Choose a window of at most 31 days.');
        return ['timeMin' => $min->toIso8601String(), 'timeMax' => $max->toIso8601String(), 'timeZone' => CalendarTools::timeZone($a['timeZone'] ?? null)];
    }
}
