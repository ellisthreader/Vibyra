<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Decisions\Preparations;
use App\Services\Vibes\Quotes;
use Illuminate\Http\Request;
final class AutoPreparationController extends Controller
{
    use UserPayloads;
    public function create(Request $r, Preparations $p)
    {
        $user = $this->authenticatedUser($r);
        abort_unless(config('vibes.enabled'), 503, 'AI chat is unavailable.');
        $d = $r->validate(['id' => 'required|uuid', 'quote' => 'required|string|max:'.Quotes::MAX_ENCODED_LENGTH]);
        return response()->json($p->start($user->id, $d['id'], $d['quote']), 202)->header('Cache-Control', 'private, no-store');
    }
    public function show(Request $r, string $id, Preparations $p)
    {
        return response()->json($p->status($this->authenticatedUser($r)->id, $id))->header('Cache-Control', 'private, no-store');
    }
}
