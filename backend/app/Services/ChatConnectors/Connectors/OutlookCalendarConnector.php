<?php

namespace App\Services\ChatConnectors\Connectors;

use App\Services\ChatConnectors\Connector;
use App\Services\ChatConnectors\Microsoft\Client;
use Carbon\CarbonImmutable;

final class OutlookCalendarConnector implements Connector
{
    public function __construct(private readonly Client $graph) {}

    public function reads(): array { return ['outlook_calendar_upcoming']; }
    public function writes(): array { return ['outlook_calendar_create_event']; }

    public function definitions(): array
    {
        return [
            ['type' => 'function', 'function' => ['name' => 'outlook_calendar_upcoming',
                'description' => 'Read up to 20 upcoming events on the primary Outlook calendar.',
                'parameters' => ['type' => 'object', 'properties' => ['days' => ['type' => 'integer']],
                    'required' => [], 'additionalProperties' => false]]],
            ['type' => 'function', 'function' => ['name' => 'outlook_calendar_create_event',
                'description' => 'Create one event on the primary Outlook calendar after exact approval. No attendees.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'title' => ['type' => 'string'], 'start' => ['type' => 'string', 'description' => 'RFC3339 with UTC offset.'],
                    'end' => ['type' => 'string', 'description' => 'RFC3339 with UTC offset.'],
                    'description' => ['type' => 'string']],
                    'required' => ['title', 'start', 'end'], 'additionalProperties' => false]]],
        ];
    }

    public function validate(string $operation, array $arguments): array
    {
        if ($operation === 'outlook_calendar_upcoming') {
            $days = $arguments['days'] ?? 7;
            abort_unless(is_int($days) && $days >= 1 && $days <= 30, 422, 'Choose 1 to 30 calendar days.');
            return ['days' => $days];
        }
        abort_unless($operation === 'outlook_calendar_create_event', 422, 'That Calendar tool is unavailable.');
        $title = $arguments['title'] ?? null;
        $description = $arguments['description'] ?? '';
        abort_unless(is_string($title) && trim($title) !== '' && mb_strlen($title) <= 150,
            422, 'Give the event a short title.');
        abort_unless(is_string($description) && mb_strlen($description) <= 2000,
            422, 'The event description is too long.');
        foreach (['start', 'end'] as $field) {
            abort_unless(is_string($arguments[$field] ?? null)
                && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/D', $arguments[$field]),
                422, 'Give event times with a timezone.');
        }
        try {
            $start = CarbonImmutable::parse($arguments['start'])->utc();
            $end = CarbonImmutable::parse($arguments['end'])->utc();
        } catch (\Throwable $e) { abort(422, 'Those calendar times are invalid.'); }
        abort_unless($end->greaterThan($start) && $start->diffInMinutes($end) <= 1440,
            422, 'The event must end after it starts and last at most one day.');
        return ['title' => trim($title), 'description' => $description,
            'start' => $start->format('Y-m-d\TH:i:s'), 'end' => $end->format('Y-m-d\TH:i:s')];
    }

    public function run(string $operation, array $arguments, string $credential): array
    {
        if ($operation === 'outlook_calendar_upcoming') {
            $now = CarbonImmutable::now('UTC');
            $data = $this->graph->get($credential, '/me/calendar/calendarView', [
                'startDateTime' => $now->toIso8601String(),
                'endDateTime' => $now->addDays($arguments['days'])->toIso8601String(),
                '$top' => 20, '$select' => 'id,subject,start,end,location,webLink', '$orderby' => 'start/dateTime']);
            $events = array_map(fn ($item) => ['id' => $item['id'] ?? null,
                'title' => $item['subject'] ?? '(untitled)', 'start' => $item['start'] ?? null,
                'end' => $item['end'] ?? null, 'location' => $item['location']['displayName'] ?? null,
                'url' => $item['webLink'] ?? null], array_slice($data['value'] ?? [], 0, 20));
            return ['result' => ['events' => $events],
                'summary' => 'Read '.count($events).' upcoming Outlook events'];
        }
        $event = $this->graph->post($credential, '/me/events', [
            'subject' => $arguments['title'], 'body' => ['contentType' => 'Text', 'content' => $arguments['description']],
            'start' => ['dateTime' => $arguments['start'], 'timeZone' => 'UTC'],
            'end' => ['dateTime' => $arguments['end'], 'timeZone' => 'UTC']]);
        if (!is_string($event['id'] ?? null)) throw new \RuntimeException('Microsoft did not confirm the event.');
        return ['result' => ['id' => $event['id'], 'url' => $event['webLink'] ?? null],
            'summary' => 'Created Outlook event '.$arguments['title']];
    }

    public function connect(string $credential): string { return $this->graph->account($credential); }
    public function prompt(): string { return "\nOutlook Calendar: show exact title, UTC times and description before approval. Do not claim creation until Microsoft returns an event ID.\n"; }
}
