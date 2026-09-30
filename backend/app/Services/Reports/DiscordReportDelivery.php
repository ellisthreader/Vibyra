<?php

namespace App\Services\Reports;

use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class DiscordReportDelivery
{
    public function ready(): bool
    {
        return $this->webhook() !== null;
    }

    private function webhook(): ?string
    {
        $value = trim((string) config('services.desktop_reports.webhook_url'));
        $parts = parse_url($value);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || ! in_array($parts['host'] ?? '', ['discord.com', 'discordapp.com'], true)
            || ! preg_match('~^/api/webhooks/[0-9]+/[^/]+$~', $parts['path'] ?? '')) {
            return null;
        }

        return $value;
    }

    public function send(
        array $report,
        User $user,
        ?string $ip,
        ?UploadedFile $screenshot,
        array $images,
        string $terminalTail,
    ): string {
        $webhook = $this->webhook();
        if ($webhook === null) {
            throw new \RuntimeException('Report webhook is missing.');
        }
        $id = 'VR-'.Str::upper(Str::random(6));
        $diagnostics = $report['includeDiagnostics'] === true;
        $context = $report['context'];
        $reporter = trim($user->name.' ('.$user->email.')');
        $environment = [
            'Version' => $context['appVersion'] ?? null,
            'Platform' => $context['platform'] ?? null,
            'Username' => $user->name,
            'Email' => $user->email,
            'Area' => $report['area'] ?? null,
            'Agent' => $context['agent'] ?? null,
            'Model' => $context['model'] ?? null,
        ];
        if ($diagnostics) {
            $environment += [
                'IP address' => $ip,
                'Device / hardware' => $context['hardware'] ?? null,
                'Project' => $context['project'] ?? null,
                'Project folder' => $context['projectRoot'] ?? null,
                'Graphics' => $context['renderer'] ?? null,
                'Screen' => $context['screen'] ?? null,
            ];
        }
        $text = "Vibyra report {$id}\n";
        foreach ($environment as $label => $value) {
            $text .= $label.': '.($value ?: '—')."\n";
        }
        foreach (['summary' => 'Summary', 'details' => 'What happened', 'error' => 'Specific error',
            'steps' => 'Steps', 'expected' => 'Expected', 'contact' => 'Contact'] as $key => $label) {
            if (! empty($report[$key])) {
                $text .= "\n{$label}\n".$report[$key]."\n";
            }
        }
        if ($terminalTail !== '') {
            $text .= "\nTerminal output\n{$terminalTail}\n";
        }
        $title = ucfirst($report['kind']).' · '.ucfirst($report['severity']).' — '.$report['summary'];
        $embed = [
            'author' => ['name' => mb_substr('Reported by '.$reporter, 0, 250)],
            'title' => mb_substr($title, 0, 250),
            'description' => mb_substr($report['details'], 0, 1500),
            'color' => match ($report['severity']) {
                'blocker' => 0xe5484d, 'high' => 0xf76808, 'low' => 0x8b8f9e,
                default => 0x5b7cfa,
            },
            'fields' => collect($environment)->filter()->map(fn ($value, $label) => [
                'name' => $label, 'value' => mb_substr((string) $value, 0, 700), 'inline' => true,
            ])->values()->all(),
            'footer' => ['text' => $id.' · full context attached'],
            'timestamp' => now()->toIso8601String(),
        ];
        if ($screenshot) {
            $embed['image'] = ['url' => 'attachment://screenshot.png'];
        }
        $payload = json_encode(['embeds' => [$embed], 'allowed_mentions' => ['parse' => []]], JSON_THROW_ON_ERROR);
        $request = Http::timeout(25)->attach('files[0]', $text, 'context.txt', ['Content-Type' => 'text/plain']);
        if ($screenshot) {
            $request = $this->attach($request, 'files[1]', $screenshot, 'screenshot.png');
        }
        foreach ($images as $index => $image) {
            $request = $this->attach($request, 'files['.($index + ($screenshot ? 2 : 1)).']', $image, 'image-'.($index + 1).'.'.$image->extension());
        }
        $response = $request->post($webhook, ['payload_json' => $payload]);
        if (! $response->successful()) {
            throw new \RuntimeException('Discord did not accept the report (HTTP '.$response->status().').');
        }

        return $id;
    }

    private function attach(PendingRequest $request, string $field, UploadedFile $file, string $name): PendingRequest
    {
        return $request->attach($field, fopen($file->getRealPath(), 'r'), $name,
            ['Content-Type' => $file->getMimeType() ?: 'application/octet-stream']);
    }
}
