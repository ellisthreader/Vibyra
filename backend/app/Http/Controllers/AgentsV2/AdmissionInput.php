<?php

namespace App\Http\Controllers\AgentsV2;

use App\Services\AgentRuns\{ApiError, RunAttachments};
use Illuminate\Http\Request;

/**
 * The admission body, shared by `POST /runs` and `POST /runs/preview`. An
 * attachment is either an uploaded file named by `id` (resolved to its stored
 * metadata) or, for older clients, metadata only.
 */
trait AdmissionInput
{
    private function admissionInput(Request $request, int $userId): array
    {
        $data = $request->validate(['agentId' => 'required|uuid',
            'idempotencyKey' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{8,100}$/D'],
            'prompt' => 'required|string|max:'.(int) config('agents_v2.max_prompt_chars'),
            'attachments' => 'sometimes|array|max:'.(int) config('agents_v2.max_attachments'),
            'attachments.*' => 'array', 'attachments.*.id' => 'sometimes|uuid',
            'attachments.*.name' => 'required_without:attachments.*.id|string|max:200',
            'attachments.*.mimeType' => 'required_without:attachments.*.id|string|max:100',
            'attachments.*.size' => 'required_without:attachments.*.id|integer|min:0',
            'attachments.*.sha256' => ['sometimes', 'regex:/^[a-f0-9]{64}$/D'], 'attachments.*.ref' => 'sometimes|string|max:500',
            'runtimeId' => 'sometimes|nullable|uuid']);
        if (trim($data['prompt']) === '') ApiError::throw(422, 'empty_prompt', 'Write a task first.');
        $data['attachments'] = app(RunAttachments::class)->resolve($userId, $data['attachments'] ?? []);
        return $data;
    }
}
