<?php

namespace App\Services\AgentRuns\Tools\Providers;

use Carbon\CarbonImmutable;

/**
 * Google Calendar for Agent V2: list calendars, list events in an explicit window
 * and timezone, free/busy, and one approved event creation (`CalendarWrites`).
 * Every call names its calendar; nothing silently falls back to another one.
 */
final class CalendarTools implements ProviderTools
{
    public const API = 'https://www.googleapis.com/calendar/v3';

    public function __construct(private readonly CalendarWrites $writes) {}

    public function tools(): array
    {
        return ['google_calendar_list_calendars' => 'read', 'google_calendar_list_events' => 'read',
            'google_calendar_freebusy' => 'read', 'google_calendar_create_event' => 'write'];
    }

    public function definition(string $tool): array
    {
        $window = ['timeMin' => ['type' => 'string', 'description' => 'RFC3339 with offset.'],
            'timeMax' => ['type' => 'string', 'description' => 'RFC3339 with offset; at most 31 days after timeMin.'],
            'timeZone' => ['type' => 'string', 'description' => 'IANA timezone for the answer, e.g. Europe/London.']];
        $calendar = ['calendarId' => ['type' => 'string', 'description' => '"primary" or an id from google_calendar_list_calendars.']];
        return match ($tool) {
            'google_calendar_list_calendars' => Schema::tool($tool, 'List the calendars this Google account can see, with '
                .'their ids, access role and timezone.', ['pageToken' => ['type' => 'string']]),
            'google_calendar_list_events' => Schema::tool($tool, 'List events on one calendar inside a time window, in a '
                .'timezone. Follow nextPageToken before claiming the window is complete.', $calendar + $window
                + ['pageToken' => ['type' => 'string'], 'maxResults' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50]],
                ['calendarId', 'timeMin', 'timeMax', 'timeZone']),
            'google_calendar_freebusy' => Schema::tool($tool, 'Busy intervals for up to 5 calendars inside a time window.',
                ['calendarIds' => ['type' => 'array', 'items' => ['type' => 'string'], 'minItems' => 1, 'maxItems' => 5]] + $window,
                ['calendarIds', 'timeMin', 'timeMax', 'timeZone']),
            default => $this->writes->definition($tool),
        };
    }

    public function validate(string $tool, array $arguments): array
    {
        if ($tool === 'google_calendar_list_calendars') {
            Schema::only($arguments, ['pageToken']);
            return array_filter(['pageToken' => Schema::pageToken($arguments)]);
        }
        if ($tool === 'google_calendar_list_events') {
            Schema::only($arguments, ['calendarId', 'timeMin', 'timeMax', 'timeZone', 'pageToken', 'maxResults']);
            $max = $arguments['maxResults'] ?? 25;
            abort_unless(is_int($max) && $max >= 1 && $max <= 50, 422, 'Choose 1 to 50 events per page.');
            return array_filter(['calendarId' => self::calendarId($arguments['calendarId'] ?? null)]
                + self::window($arguments) + ['pageToken' => Schema::pageToken($arguments), 'maxResults' => $max],
                fn ($v) => $v !== null);
        }
        if ($tool === 'google_calendar_freebusy') {
            Schema::only($arguments, ['calendarIds', 'timeMin', 'timeMax', 'timeZone']);
            $ids = $arguments['calendarIds'] ?? null;
            abort_unless(is_array($ids) && array_is_list($ids) && count($ids) >= 1 && count($ids) <= 5, 422,
                'Choose 1 to 5 calendars.');
            return ['calendarIds' => array_values(array_unique(array_map([self::class, 'calendarId'], $ids)))]
                + self::window($arguments);
        }
        return $this->writes->validate($tool, $arguments);
    }

    public function run(string $tool, array $arguments, string $credential, string $key): array
    {
        return match ($tool) {
            'google_calendar_list_calendars' => $this->calendars($arguments, $credential),
            'google_calendar_list_events' => $this->events($arguments, $credential),
            'google_calendar_freebusy' => $this->freebusy($arguments, $credential),
            default => $this->writes->run($arguments, $credential, $key),
        };
    }

    public function reconcile(string $tool, array $arguments, string $credential, string $key): ?array
    {
        return $tool === 'google_calendar_create_event' ? $this->writes->reconcile($arguments, $credential, $key) : null;
    }

    private function calendars(array $a, string $token): array
    {
        $body = $this->get($token, self::API.'/users/me/calendarList', array_filter(['maxResults' => 50,
            'pageToken' => $a['pageToken'] ?? null]));
        $rows = array_map(fn ($c) => ['id' => $c['id'] ?? null, 'summary' => mb_substr((string) ($c['summary'] ?? ''), 0, 200),
            'primary' => (bool) ($c['primary'] ?? false), 'accessRole' => $c['accessRole'] ?? null,
            'timeZone' => $c['timeZone'] ?? null], array_slice($body['items'] ?? [], 0, 50));
        return ['result' => ['calendars' => $rows] + self::paging($body), 'summary' => 'Listed '.count($rows).' calendars'];
    }

    private function events(array $a, string $token): array
    {
        $body = $this->get($token, self::API.'/calendars/'.rawurlencode($a['calendarId']).'/events', array_filter([
            'timeMin' => $a['timeMin'], 'timeMax' => $a['timeMax'], 'timeZone' => $a['timeZone'], 'singleEvents' => 'true',
            'orderBy' => 'startTime', 'maxResults' => $a['maxResults'], 'pageToken' => $a['pageToken'] ?? null]));
        $rows = array_map(fn ($e) => ['id' => $e['id'] ?? null, 'title' => mb_substr((string) ($e['summary'] ?? '(untitled)'), 0, 250),
            'start' => $e['start']['dateTime'] ?? $e['start']['date'] ?? null, 'end' => $e['end']['dateTime'] ?? $e['end']['date'] ?? null,
            'allDay' => isset($e['start']['date']), 'status' => $e['status'] ?? null, 'busy' => ($e['transparency'] ?? 'opaque') !== 'transparent',
            'url' => $e['htmlLink'] ?? null], array_slice($body['items'] ?? [], 0, 50));
        return ['result' => ['calendarId' => $a['calendarId'], 'timeZone' => $body['timeZone'] ?? $a['timeZone'],
            'events' => $rows] + self::paging($body), 'summary' => 'Read '.count($rows).' events from '.$a['calendarId']];
    }

    private function freebusy(array $a, string $token): array
    {
        $response = ProviderHttp::send('Google Calendar', 'google_calendar', false, fn () => ProviderHttp::google($token)
            ->post(self::API.'/freeBusy', ['timeMin' => $a['timeMin'], 'timeMax' => $a['timeMax'], 'timeZone' => $a['timeZone'],
                'items' => array_map(fn ($id) => ['id' => $id], $a['calendarIds'])]));
        $body = ProviderHttp::json($response, 'Google Calendar', false);
        $calendars = [];
        foreach ($a['calendarIds'] as $id) {
            $entry = $body['calendars'][$id] ?? null;
            $calendars[] = ['calendarId' => $id, 'busy' => array_map(fn ($b) => ['start' => $b['start'] ?? null, 'end' => $b['end'] ?? null],
                array_slice($entry['busy'] ?? [], 0, 200)),
                'error' => is_array($entry['errors'][0] ?? null) ? (string) ($entry['errors'][0]['reason'] ?? 'unavailable') : ($entry ? null : 'missing')];
        }
        return ['result' => ['timeMin' => $a['timeMin'], 'timeMax' => $a['timeMax'], 'timeZone' => $a['timeZone'],
            'calendars' => $calendars], 'summary' => 'Checked free/busy for '.count($calendars).' calendars'];
    }

    private function get(string $token, string $url, array $query): array
    {
        return ProviderHttp::json(ProviderHttp::send('Google Calendar', 'google_calendar', false,
            fn () => ProviderHttp::google($token)->get($url, $query)), 'Google Calendar', false);
    }

    private static function paging(array $body): array
    {
        $next = is_string($body['nextPageToken'] ?? null) ? $body['nextPageToken'] : null;
        return ['hasMore' => $next !== null, 'nextPageToken' => $next,
            'coverage' => $next !== null ? 'Partial: pass nextPageToken to continue.' : 'Complete.'];
    }

    public static function calendarId(mixed $id): string
    {
        abort_unless(is_string($id) && strlen($id) <= 255 && ($id === 'primary'
            || preg_match('/\A[A-Za-z0-9._%+#\-]+@[A-Za-z0-9.\-]+\z/D', $id)), 422, 'Use "primary" or an exact calendar id.');
        return $id;
    }

    public static function timeZone(mixed $zone): string
    {
        abort_unless(is_string($zone) && in_array($zone, \DateTimeZone::listIdentifiers(), true), 422,
            'Give an IANA timezone such as Europe/London.');
        return $zone;
    }

    public static function instant(mixed $value, string $field): CarbonImmutable
    {
        abort_unless(is_string($value) && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/D', $value),
            422, 'Give '.$field.' as an RFC3339 time with an offset.');
        try { return CarbonImmutable::parse($value); } catch (\Throwable) { abort(422, 'That '.$field.' is not a valid time.'); }
    }

    /** @return array{timeMin: string, timeMax: string, timeZone: string} */
    private static function window(array $a): array
    {
        $min = self::instant($a['timeMin'] ?? null, 'timeMin');
        $max = self::instant($a['timeMax'] ?? null, 'timeMax');
        abort_unless($max->greaterThan($min) && $min->diffInDays($max) <= 31, 422, 'Choose a window of at most 31 days.');
        return ['timeMin' => $min->toIso8601String(), 'timeMax' => $max->toIso8601String(),
            'timeZone' => self::timeZone($a['timeZone'] ?? null)];
    }
}
