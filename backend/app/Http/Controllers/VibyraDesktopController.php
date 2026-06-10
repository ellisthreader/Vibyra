<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\DesktopResponses;
use App\Services\ContentModeration;
use App\Services\VibyraDesktopState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\View\View;

class VibyraDesktopController extends Controller
{
    use DesktopResponses;

    public function __construct(
        private readonly VibyraDesktopState $desktop,
        private readonly ContentModeration $moderation,
    )
    {
    }

    public function app(): View
    {
        return view('desktop');
    }

    public function state(): JsonResponse
    {
        return $this->json($this->desktop->publicState());
    }

    public function health(): JsonResponse
    {
        return $this->json($this->desktop->health());
    }

    public function pair(Request $request): JsonResponse
    {
        $this->moderation->assertLocalTextAllowed((string) $request->input('deviceName', 'Vibyra Phone'), 'pair.deviceName');

        return $this->json($this->desktop->requestPair(
            (string) $request->input('code'),
            (string) $request->input('deviceName', 'Vibyra Phone')
        ), 202);
    }

    public function pairStatus(Request $request): JsonResponse
    {
        return $this->json($this->desktop->pairStatus((string) $request->query('requestId')));
    }

    public function approve(): JsonResponse
    {
        return $this->json($this->desktop->approvePair());
    }

    public function deny(): JsonResponse
    {
        return $this->json($this->desktop->denyPair());
    }

    public function projects(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->projects());
    }

    public function desktopFolders(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->desktopFolders());
    }

    public function desktopSearch(Request $request): JsonResponse
    {
        $this->authorizeToken($request);
        $query = (string) $request->query('q', '');
        $this->moderation->assertLocalTextAllowed($query !== '' ? $query : 'desktop search', 'desktop.search');

        return $this->json($this->desktop->desktopSearch($query));
    }

    public function createProject(Request $request): JsonResponse
    {
        $this->authorizeToken($request);
        $this->moderation->assertTextAllowed((string) $request->input('name', 'Untitled Workspace'), 'project.name');

        return $this->json($this->desktop->createProject((string) $request->input('name', 'Untitled Workspace')), 201);
    }

    public function files(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->files((string) $request->query('projectId')));
    }

    public function createFile(Request $request): JsonResponse
    {
        $this->authorizeToken($request);
        $this->moderation->assertFieldsAllowed([
            'path' => (string) $request->input('path', 'note.txt'),
            'content' => (string) $request->input('content', ''),
        ], 'file.create');

        return $this->json($this->desktop->createFile(
            (string) $request->input('projectId'),
            (string) $request->input('path', 'note.txt'),
            (string) $request->input('content', '')
        ), 201);
    }

    public function readFile(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->readFile(
            (string) $request->query('projectId'),
            (string) $request->query('path')
        ));
    }

    public function events(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->events());
    }

    public function projectPreview(string $projectId, string $token, ?string $path = null): Response
    {
        $preview = $this->desktop->projectPreview($projectId, $token, $path ?? '');

        return response($preview['body'], $preview['status'])
            ->withHeaders([
                'Content-Type' => $preview['contentType'],
            ]);
    }

    public function startPreview(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->startPreview((string) $request->input('projectId')));
    }

    public function startAgent(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->startAgent(
            (string) $request->input('projectId'),
            (string) $request->input('projectPath', ''),
            (string) $request->input('prompt'),
            (string) $request->input('model', 'gpt-5.5'),
            (string) $request->input('reasoningEffort', 'medium'),
            $request->boolean('apply')
        ));
    }

    public function applyAgent(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->applyPendingAgent((string) $request->input('runId')));
    }

    public function discardAgent(Request $request): JsonResponse
    {
        $this->authorizeToken($request);

        return $this->json($this->desktop->discardPendingAgent((string) $request->input('runId')));
    }

    public function runCommand(Request $request): JsonResponse
    {
        $this->authorizeToken($request);
        $this->moderation->assertTextAllowed((string) $request->input('command'), 'command.input');

        return $this->json($this->desktop->runCommand(
            (string) $request->input('projectId'),
            (string) $request->input('command')
        ));
    }

}
