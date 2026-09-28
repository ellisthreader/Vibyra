<?php

namespace App\Http\Controllers;

use App\Services\Analytics\Recorder;
use App\Services\Website\FaqAnswerer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class WebsiteFaqController extends Controller
{
    /**
     * Answers the visitor's own question at the foot of the homepage FAQ.
     * No account is involved; the route is throttled per address instead.
     */
    public function ask(Request $request, FaqAnswerer $answerer): JsonResponse
    {
        $question = trim(preg_replace('/\s+/u', ' ', (string) $request->input('question', '')) ?? '');

        if (mb_strlen($question) < 3) {
            return response()->json(['ok' => false, 'error' => 'Type a question first.'], 422);
        }
        if (mb_strlen($question) > FaqAnswerer::MAX_QUESTION_CHARS) {
            return response()->json([
                'ok' => false,
                'error' => 'Keep it under '.FaqAnswerer::MAX_QUESTION_CHARS.' characters.',
            ], 422);
        }

        try {
            $result = $answerer->answer($question);
            app(Recorder::class)->consented($request, 'website_faq_answered');
        } catch (Throwable $error) {
            Log::warning('website faq answer failed', ['error' => $error->getMessage()]);

            return response()->json([
                'ok' => false,
                'error' => 'We couldn’t answer that just now. Try again in a moment, or email hello@vibyra.com.',
            ], 503);
        }

        return response()->json(['ok' => true, 'answer' => $result['answer'], 'cached' => $result['cached']]);
    }
}
