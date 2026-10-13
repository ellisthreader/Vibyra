<?php

namespace App\Http\Controllers;

use App\Jobs\NotifyPublicRequest;
use App\Models\PublicRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class PublicRequestController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:254'],
            'topic' => ['required', Rule::in(PublicRequest::TOPICS)],
            'details' => ['nullable', 'string', 'max:500'],
        ]);

        $record = PublicRequest::query()->create([
            'reference' => (string) Str::ulid(),
            'email' => Str::lower(trim($validated['email'])),
            'topic' => $validated['topic'],
            'details' => isset($validated['details']) ? trim($validated['details']) : null,
        ]);

        try {
            NotifyPublicRequest::dispatch($record->id)->afterCommit();
        } catch (\Throwable) {
            // The scheduled sweep retries persisted requests even if queueing fails.
            Log::warning('Public request notification pending', ['reference' => $record->reference]);
        }

        return to_route('privacy.requests')->with('request_reference', $record->reference);
    }
}
