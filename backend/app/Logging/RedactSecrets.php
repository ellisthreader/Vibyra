<?php
namespace App\Logging;
use Monolog\LogRecord;
/** Last-mile protection for standard Laravel channels, including exception contexts. */
final class RedactSecrets
{
    public function __invoke($logger): void { $logger->pushProcessor([$this, 'process']); }
    public function process(LogRecord $record): LogRecord
    {
        return $record->with(message: $this->text($record->message), context: $this->clean($record->context), extra: $this->clean($record->extra));
    }
    public function clean(mixed $value, int $depth = 0): mixed
    {
        if ($depth > 8) return '[OMITTED]';
        if (is_string($value)) return $this->text($value);
        if ($value instanceof \Throwable) return ['type' => get_class($value), 'message' => $this->text($value->getMessage())];
        if (is_object($value)) return '[OBJECT '.get_class($value).']';
        if (!is_array($value)) return $value;
        $safe = [];
        foreach ($value as $key => $entry) {
            $safe[$this->text((string) $key)] = preg_match('/authorization|cookie|password|secret|api.?key|access.?token|refresh.?token|^token$|^key$|bearer/i', (string) $key)
                ? '[REDACTED]' : $this->clean($entry, $depth + 1);
        }
        return $safe;
    }
    private function text(string $text): string
    {
        foreach (['intelligence.jev_key', 'services.openrouter.key', 'intelligence.expo_token', 'app.key'] as $name) {
            $secret = config($name);
            if (is_string($secret) && strlen($secret) >= 12) $text = str_replace($secret, '[REDACTED]', $text);
        }
        $text = preg_replace('/\bsk-(?:or-v1-|proj-|ant-)?[A-Za-z0-9_-]{16,}/', '[REDACTED]', $text);
        return preg_replace('/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i', 'Bearer [REDACTED]', $text);
    }
}
