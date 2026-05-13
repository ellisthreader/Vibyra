<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\AuthEndpoints;
use App\Http\Controllers\Concerns\ChatEndpoint;
use App\Http\Controllers\Concerns\ChatModelMap;
use App\Http\Controllers\Concerns\ChatPrompting;
use App\Http\Controllers\Concerns\CommunityAssetGeneration;
use App\Http\Controllers\Concerns\CommunityPublishMedia;
use App\Http\Controllers\Concerns\CommunityPublishing;
use App\Http\Controllers\Concerns\LevelEndpoints;
use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Community\ProjectSafetyReview;
use App\Services\ContentModeration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VibyraAppController extends Controller
{
    use AuthEndpoints;
    use ChatEndpoint;
    use ChatModelMap;
    use ChatPrompting;
    use CommunityAssetGeneration;
    use CommunityPublishMedia;
    use CommunityPublishing;
    use LevelEndpoints;
    use UserPayloads;

    private const FREE_CREDITS = 50;

    public function __construct(
        private readonly ContentModeration $moderation,
        private readonly ProjectSafetyReview $projectSafetyReview,
    )
    {
    }

    public function moderate(Request $request): JsonResponse
    {
        $this->authenticatedUser($request);
        $surface = (string) $request->input('surface', 'user upload');
        $failClosed = ! str_contains($surface, 'community.comment');

        $decision = $this->moderation->assertModerationInputAllowed([
            'text' => (string) $request->input('text', ''),
            'images' => (array) $request->input('images', []),
        ], $surface, $failClosed);

        return $this->json([
            'ok' => true,
            'moderation' => [
                'blocked' => false,
                'warning' => $decision['warning'] ?? null,
            ],
        ]);
    }

    public function options(): JsonResponse
    {
        return $this->json([]);
    }

    public function skills(): JsonResponse
    {
        $skills = collect(config('skills.list', []))
            ->map(fn ($skill) => [
                'id' => $skill['id'],
                'slash' => $skill['slash'],
                'label' => $skill['label'],
                'description' => $skill['description'] ?? '',
                'category' => $skill['category'] ?? 'general',
                'mode' => $skill['mode'] ?? 'chat',
            ])
            ->values()
            ->all();

        return $this->json(['ok' => true, 'skills' => $skills]);
    }
}
