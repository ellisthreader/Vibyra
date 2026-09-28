<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use App\Services\ChatConnectors\Google\Client;
use Carbon\CarbonImmutable;

final class GoogleCalendarConnector implements Connector
{
    private const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

    public function __construct(private readonly Client $google) {}

    public function reads(): array { return ['google_calendar_upcoming']; }
    public function writes(): array { return ['google_calendar_create_event']; }

    public function definitions(): array
    {
        return [
            ['type' => 'function', 'function' => ['name' => 'google_calendar_upcoming',
                'description' => 'Read up to 20 upcoming events from the connected primary Google Calendar.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'days' => ['type' => 'integer', 'description' => 'Days ahead, 1 to 30; default 7.']],
                    'required' => [], 'additionalProperties' => false]]],
            ['type' => 'function', 'function' => ['name' => 'google_calendar_create_event',
                'description' => 'Create one event on the connected primary calendar after exact approval. No attendees are invited.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'title' => ['type' => 'string'], 'start' => ['type' => 'string', 'description' => 'RFC3339 time with UTC offset.'],
                    'end' => ['type' => 'string', 'description' => 'RFC3339 time with UTC offset.'],
                    'description' => ['type' => 'string']],
                    'required' => ['title', 'start', 'end'], 'additionalProperties' => false]]],
        ];
    }

    public function validate(string $operation, array $arguments): array
    {
        if ($operation === 'google_calendar_upcoming') {
            $days = $arguments['days'] ?? 7;
            abort_unless(is_int($days) && $days >= 1 && $days <= 30, 422, 'Choose 1 to 30 calendar days.');
            return ['days' => $days];
        }
        abort_unless($operation === 'google_calendar_create_event', 422, 'That Calendar tool is unavailable.');
        $title = $arguments['title'] ?? null;
        abort_unless(is_string($title) && trim($title) !== '' && mb_strlen($title) <= 150, 422, 'Give the event a short title.');
        $description = $arguments['description'] ?? '';
        abort_unless(is_string($description) && mb_strlen($description) <= 2000, 422, 'The event description is too long.');
        foreach (['start', 'end'] as $field) {
            abort_unless(is_string($arguments[$field] ?? null)
                && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/D', $arguments[$field]),
                422, 'Give the event start and end with a timezone.');
        }
        try {
            $start = CarbonImmutable::parse($arguments['start']);
            $end = CarbonImmutable::parse($arguments['end']);
        } catch (\Throwable $e) { abort(422, 'Those calendar times are invalid.'); }
        abort_unless($end->greaterThan($start) && $start->diffInMinutes($end) <= 1440,
            422, 'The event must end after it starts and last at most one day.');
        return ['title' => trim($title), 'start' => $start->toIso8601String(),
            'end' => $end->toIso8601String(), 'description' => $description];
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        if ($operation === 'google_calendar_upcoming') {
            $now = CarbonImmutable::now('UTC');
            $body = $this->google->get($credential, self::BASE, ['timeMin' => $now->toIso8601String(),
                'timeMax' => $now->addDays($arguments['days'])->toIso8601String(), 'singleEvents' => 'true',
                'orderBy' => 'startTime', 'maxResults' => 20]);
            $events = array_map(fn ($event) => ['id' => $event['id'] ?? null,
                'title' => $event['summary'] ?? '(untitled)', 'start' => $event['start']['dateTime'] ?? $event['start']['date'] ?? null,
                'end' => $event['end']['dateTime'] ?? $event['end']['date'] ?? null,
                'location' => $event['location'] ?? null, 'url' => $event['htmlLink'] ?? null],
                array_slice($body['items'] ?? [], 0, 20));
            return ['result' => ['events' => $events], 'summary' => 'Read '.count($events).' upcoming Google Calendar events'];
        }
        $body = $this->google->post($credential, self::BASE, ['summary' => $arguments['title'],
            'description' => $arguments['description'], 'start' => ['dateTime' => $arguments['start']],
            'end' => ['dateTime' => $arguments['end']]]);
        if (!is_string($body['id'] ?? null)) throw new \RuntimeException('Google did not confirm the event.');
        return ['result' => ['id' => $body['id'], 'url' => $body['htmlLink'] ?? null,
            'title' => $body['summary'] ?? $arguments['title']], 'summary' => 'Created Google Calendar event '.$arguments['title']];
    }

    public function connect(string $credential): string { return $this->google->account($credential); }
    public function prompt(): string { return "\nGoogle Calendar: use only the connected primary calendar. Show exact title and times before creating an event; do not claim an event exists until the tool returns its ID.\n"; }
}
