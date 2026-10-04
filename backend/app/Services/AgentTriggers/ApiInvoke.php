<?php

namespace App\Services\AgentTriggers;

use App\Services\AgentRuns\ApiError;

/**
 * Roadmap Part 11 `api.invoke`: a trigger the person's own code calls (`POST hooks/api/{trigger}` with the trigger's secret, or
 * `POST /api/platform/v1/triggers/{id}/invoke` with an API key that has `triggers:invoke`). The call may carry `title`, `text`, a
 * `subject` (what the call is about: one live run per subject, the same loop guard as an issue or a thread) and a flat `data`
 * map. Only those named fields are kept, bounded, so a body cannot smuggle structure into a run's prompt.
 */
final class ApiInvoke
{
    public static function enabled(): bool
    {
        return (bool) config('platform.api_trigger');
    }

    /** No filter: the saved prompt is the instruction and every authenticated call is an event. */
    public static function filter(array $f): array
    {
        if (!self::enabled()) ApiError::throw(409, 'provider_unavailable', 'API triggers are not switched on yet.');
        return [];
    }

    /** @return array [type, summary, subject, actor ids] */
    public static function match(array $body): array
    {
        $data = [];
        foreach (is_array($body['data'] ?? null) ? $body['data'] : [] as $key => $value) {
            if (count($data) >= 20) break;
            if (is_string($key) && preg_match('/^[A-Za-z0-9_.-]{1,40}$/D', $key) && is_scalar($value)) $data[$key] = TriggerKinds::text(is_bool($value) ? json_encode($value) : $value, 300);
        }
        $subject = TriggerKinds::text($body['subject'] ?? '', 120);
        return ['api.invoke', array_filter(['title' => TriggerKinds::text($body['title'] ?? '', 300), 'text' => TriggerKinds::text($body['text'] ?? '', 4000),
            'subject' => $subject, 'data' => $data], fn ($v) => $v !== '' && $v !== []), $subject === '' ? null : 'api:'.$subject, []];
    }
}
