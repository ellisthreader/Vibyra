<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Remote\SecurityEvents;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;

class RemoteSecurityEventsController extends Controller
{
    use UserPayloads;

    public function index(Request $request, SecurityEvents $events): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $rows = DB::table('security_events')->where('user_id', $user->id)->orderByDesc('id')->limit(100)->get();
        return response()->json(['ok' => true, 'events' => $rows->map(fn ($row) => [
            'id' => $row->uuid, 'eventType' => $row->event_type, 'title' => $events->title($row->event_type),
            'metadata' => json_decode($row->metadata, true), 'createdAt' => \Illuminate\Support\Carbon::parse($row->created_at)->toIso8601String(), 'read' => $row->read_at !== null,
        ])])->header('Cache-Control', 'private, no-store');
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $row = DB::table('security_events')->where('user_id', $user->id)->where('uuid', $id)->first();
        if (! $row) return response()->json(['ok' => false, 'error' => 'That security event is not available.'], 404);
        DB::table('security_events')->where('id', $row->id)->update(['read_at' => $row->read_at ?? now()]);
        return response()->json(['ok' => true])->header('Cache-Control', 'no-store');
    }
}
