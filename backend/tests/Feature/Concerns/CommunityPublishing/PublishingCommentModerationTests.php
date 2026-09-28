<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use Illuminate\Support\Facades\Http; 


trait PublishingCommentModerationTests
{
    public function test_community_comment_route_rejects_banned_text_before_saving(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Comment Publisher',
            'email' => 'comment.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];
        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'comment-route-project',
            'title' => 'Comment Route Project',
            'description' => 'A clean app for comment route moderation.',
            'stack' => 'React',
            'previewHtml' => '<!doctype html><html><body><h1>Safe</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Safe</h1></body></html>'],
            ],
        ], $headers)->assertCreated();

        Http::fake();

        $this->postJson("/api/community/projects/{$publish->json('project.id')}/comments", [
            'text' => 'f.u.c.k this project',
        ], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('moderation.blocked', true)
            ->assertJsonPath('moderation.reason', 'pattern');

        $this->assertSame(0, PublishedProjectComment::count());
        Http::assertNothingSent();
    }
}
