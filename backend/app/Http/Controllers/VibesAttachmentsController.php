<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Vibes\{Attachments, Wallet};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * A photo or file uploaded ahead of the message it goes with, so the message is
 * priced knowing what it carries. Guests may attach, as they may chat; nobody may
 * before allowing AI processing, because an attachment exists only to be sent to one.
 */
class VibesAttachmentsController extends Controller
{
    use UserPayloads;

    /** Per account per day: plenty for a person, and a bound on what storage can hold. */
    private const DAILY = 100;

    public function store(Request $request, Attachments $attachments, Wallet $wallet)
    {
        abort_unless(config('vibes.enabled'), 503, 'AI chat is not available yet. Your computer sessions still work.');
        $user = $this->authenticatedUser($request, allowGuest: true);
        $wallet->ensure($user);
        abort_unless(DB::table('vibes_wallets')->where('user_id', $user->id)->value('consented_at'), 403,
            'Allow AI processing before attaching photos or files.');
        $request->validate(['file' => 'required|file|max:'.Attachments::MAX_KILOBYTES],
            ['file.max' => 'Attach a file under 2 MB.', 'file.uploaded' => 'Attach a file under 2 MB.']);
        abort_if(DB::table('vibes_attachments')->where('user_id', $user->id)->where('created_at', '>', now()->subDay())->count() >= self::DAILY,
            429, 'That is a lot of attachments for one day. Try again tomorrow.');

        return $this->json(['attachment' => $attachments->payload($attachments->store($user->id, $request->file('file')))], 201);
    }
}
