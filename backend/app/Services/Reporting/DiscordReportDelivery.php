<?php

namespace App\Services\Reporting;

use App\Exceptions\ReportDeliveryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class DiscordReportDelivery
{
    public function __construct(private readonly DiscordReportFormatter $formatter) {}

    public function deliver(array $report, ?UploadedFile $screenshot, array $images): string
    {
        $webhook = $this->webhook();
        $id = $this->reportId();
        $request = Http::timeout(20)->acceptJson();
        $index = 0;
        if ($screenshot) {
            $request = $this->attach($request, $index++, $screenshot, 'screenshot.png', 'image/png');
        }
        $context = $this->formatter->contextText($report, $id);
        $request = $request->attach("files[{$index}]", $context, 'context.txt', [
            'Content-Type' => 'text/plain; charset=utf-8',
        ]);
        $index++;
        foreach ($images as $imageIndex => $image) {
            $mime = (string) $image->getMimeType();
            $request = $this->attach($request, $index++, $image,
                'image-'.($imageIndex + 1).$this->extension($mime), $mime);
        }
        $payload = $this->formatter->payload($report, $id, $screenshot !== null);

        try {
            $response = $request->post($webhook, [
                'payload_json' => json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            ]);
        } catch (ConnectionException) {
            throw new ReportDeliveryException('Vibyra could not reach reporting. Check your connection and try again.');
        } catch (Throwable $error) {
            Log::warning('Vibyra report delivery failed before Discord answered', ['error' => $error->getMessage()]);
            throw new ReportDeliveryException('Reporting is temporarily unavailable. Try again shortly.');
        }
        if (! $response->successful()) {
            Log::warning('Discord rejected a Vibyra report', ['status' => $response->status(), 'report_id' => $id]);
            $message = $response->status() === 429
                ? 'Reporting is busy. Wait a moment and try again.'
                : 'Reporting is temporarily unavailable. Try again shortly.';
            throw new ReportDeliveryException($message);
        }

        return $id;
    }

    private function attach(PendingRequest $request, int $index, UploadedFile $file,
        string $name, string $mime): PendingRequest
    {
        $bytes = file_get_contents($file->getRealPath());
        if ($bytes === false) {
            throw new ReportDeliveryException('Vibyra could not read one of the report attachments.');
        }

        return $request->attach("files[{$index}]", $bytes, $name, ['Content-Type' => $mime]);
    }

    private function webhook(): string
    {
        $url = trim((string) config('services.vibyra_reports.webhook_url'));
        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = array_values(array_filter(explode('/', trim((string) ($parts['path'] ?? ''), '/'))));
        $discordHost = $host === 'discord.com' || $host === 'discordapp.com' || str_ends_with($host, '.discord.com');
        if (($parts['scheme'] ?? '') !== 'https' || ! $discordHost || count($path) < 4
            || $path[0] !== 'api' || $path[1] !== 'webhooks' || $path[2] === '' || $path[3] === '') {
            throw new ReportDeliveryException('Reporting is temporarily unavailable. Try again shortly.');
        }

        return $url;
    }

    private function reportId(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789';
        $bytes = random_bytes(6);
        $suffix = '';
        foreach (str_split($bytes) as $byte) {
            $suffix .= $alphabet[ord($byte) % strlen($alphabet)];
        }

        return "VR-{$suffix}";
    }

    private function extension(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => '.jpg', 'image/gif' => '.gif',
            'image/webp' => '.webp', 'image/bmp' => '.bmp', default => '.png',
        };
    }
}
