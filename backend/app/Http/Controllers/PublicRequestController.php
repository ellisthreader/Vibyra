<?php

namespace App\Http\Controllers;

use App\Models\PublicRequest;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
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

        return to_route('privacy.requests')->with('request_reference', $record->reference);
    }
}
