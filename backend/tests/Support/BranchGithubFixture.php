<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Http;

/** Deterministic Git Data API receipts for a single Agent branch. */
trait BranchGithubFixture
{
    private function fakeGithub(string $branch): void
    {
        Http::fake(function ($request) use ($branch) {
            $url = $request->url();
            if (str_ends_with($url, '/git/ref/heads/main')) return Http::response([
                'ref' => 'refs/heads/main', 'object' => ['type' => 'commit', 'sha' => str_repeat('a', 40)]]);
            if (str_ends_with($url, '/git/ref/heads/'.$branch)) return Http::response([], 404);
            if (str_ends_with($url, '/git/commits/'.str_repeat('a', 40)))
                return Http::response(['sha' => str_repeat('a', 40), 'tree' => ['sha' => str_repeat('b', 40)]]);
            if (str_ends_with($url, '/git/blobs')) return Http::response(['sha' => sha1("blob 6\0after\n")], 201);
            if (str_ends_with($url, '/git/trees')) return Http::response(['sha' => str_repeat('c', 40)], 201);
            if (str_ends_with($url, '/git/commits')) return Http::response(['sha' => str_repeat('d', 40),
                'message' => 'Fix login', 'tree' => ['sha' => str_repeat('c', 40)],
                'parents' => [['sha' => str_repeat('a', 40)]]], 201);
            if (str_ends_with($url, '/git/refs')) return Http::response([
                'ref' => 'refs/heads/'.$branch,
                'object' => ['type' => 'commit', 'sha' => str_repeat('d', 40)]], 201);
            return Http::response([], 404);
        });
    }
}
