<?php

namespace App\Http\Controllers\Concerns;

use App\Exceptions\ReportDeliveryException;
use App\Services\Reporting\DiscordReportDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

trait DesktopReportEndpoint
{
    public function submitDesktopReport(Request $request, DiscordReportDelivery $delivery): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $upload = $request->validate([
            'report' => ['required', 'string', 'json', 'max:70000'],
            'screenshot' => ['nullable', 'file', 'mimetypes:image/png', 'max:7680'],
            'images' => ['nullable', 'array', 'max:4'],
            'images.*' => ['file', 'mimetypes:image/png,image/jpeg,image/gif,image/webp,image/bmp', 'max:8192'],
        ]);
        $decoded = json_decode($upload['report'], true);
        if (! is_array($decoded)) {
            throw ValidationException::withMessages(['report' => 'The report must be a JSON object.']);
        }
        $report = Validator::make($decoded, $this->desktopReportRules())->validate();
        $report['context']['reporter'] = trim("{$user->name} ({$user->email})");
        $report['context']['accountId'] = (string) $user->id;

        try {
            $id = $delivery->deliver($report, $request->file('screenshot'), $request->file('images', []));
        } catch (ReportDeliveryException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 503);
        }

        return $this->json(['ok' => true, 'reportId' => $id]);
    }

    private function desktopReportRules(): array
    {
        $optional = ['nullable', 'string', 'max:2048'];

        return [
            'kind' => ['required', Rule::in(['bug', 'crash', 'visual', 'performance', 'idea', 'question'])],
            'severity' => ['required', Rule::in(['blocker', 'high', 'normal', 'low'])],
            'summary' => ['required', 'string', 'max:300'],
            'details' => ['required', 'string', 'max:8000'],
            'steps' => ['nullable', 'string', 'max:8000'],
            'expected' => ['nullable', 'string', 'max:8000'],
            'area' => ['nullable', 'string', 'max:100'],
            'contact' => ['nullable', 'string', 'max:200'],
            'terminalTail' => ['nullable', 'string', 'max:40000'],
            'context' => ['required', 'array'],
            'context.appVersion' => $optional,
            'context.platform' => $optional,
            'context.renderer' => $optional,
            'context.view' => $optional,
            'context.project' => $optional,
            'context.projectRoot' => $optional,
            'context.agent' => $optional,
            'context.model' => $optional,
            'context.pane' => $optional,
            'context.locale' => $optional,
            'context.screen' => $optional,
        ];
    }
}
