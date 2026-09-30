<?php

/** Deterministic model and GitHub for one isolated signed-app Agent task. */
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\{Artisan, Http};

$base = getenv('BRANCH_FIXTURE_BASE_SHA');
$branch = getenv('BRANCH_FIXTURE_BRANCH');
$scriptHash = getenv('BRANCH_FIXTURE_SCRIPT_SHA');
$fixedHash = hash('sha256', "fixed\n");
$head = str_repeat('d', 40);
$tree = str_repeat('c', 40);
$published = false;
Http::preventStrayRequests();
Http::fake(function ($request) use ($base, $branch, $scriptHash, $fixedHash, $head, $tree, &$published) {
    $url = $request->url();
    if (str_contains($url, 'openrouter.ai/')) {
        $messages = $request->data()['messages'] ?? [];
        $tools = array_values(array_filter($messages, fn ($item) => ($item['role'] ?? '') === 'tool'));
        $step = count($tools);
        $last = $step ? json_decode($tools[$step - 1]['content'], true) : [];
        $name = null; $args = [];
        if ($step === 0) { $name = 'github_issue'; $args = ['repository' => 'fixture/repo', 'number' => 4]; }
        elseif ($step === 1 && ($last['title'] ?? '') === 'Fix note') {
            $name = 'read_file'; $args = ['path' => 'notes.txt'];
        } elseif ($step === 2 && ($last['content'] ?? '') === "broken\n") {
            $name = 'write_file'; $args = ['path' => 'notes.txt', 'content' => "fixed\n",
                'expectedSha256' => hash('sha256', "broken\n")];
        } elseif ($step === 3 && ($last['written'] ?? false) === true
            && ($last['sha256'] ?? '') === $fixedHash) {
            $name = 'run_test'; $args = ['script' => 'tests/check.sh', 'timeoutSeconds' => 45,
                'files' => [['path' => 'notes.txt', 'sha256' => $fixedHash],
                    ['path' => 'tests/check.sh', 'sha256' => $scriptHash]]];
        } elseif ($step === 4 && ($last['exitCode'] ?? null) === 0
            && str_contains($last['output'] ?? '', 'FIXTURE_TEST_PASS')) {
            $name = 'git_publish_preview';
        } elseif ($step === 5 && ($last['files'][0]['sha256'] ?? '') === $fixedHash) {
            $name = 'publish_branch'; $args = ['repository' => 'fixture/repo',
                'baseBranch' => 'main', 'message' => 'Fix issue #4',
                'snapshotSha256' => $last['snapshotSha256']];
        } elseif ($step === 6 && ($last['published'] ?? false) === true
            && ($last['headSha'] ?? '') === $head) {
            $name = 'github_create_pull_request'; $args = ['repository' => 'fixture/repo',
                'head' => $branch, 'base' => 'main', 'expectedHeadSha' => $head,
                'expectedBaseSha' => $base, 'title' => 'Fix issue #4',
                'body' => 'The focused shell test passed.', 'draft' => true];
        } elseif ($step !== 7 || ($last['opened'] ?? false) !== true) {
            throw new RuntimeException('The signed Agent task returned an unexpected tool receipt at step '.$step
                .' (exit='.json_encode($last['exitCode'] ?? null).', output='
                .substr((string) ($last['output'] ?? ''), 0, 120).')');
        }
        $message = $name === null
            ? ['role' => 'assistant', 'content' => 'Issue #4 fixed, VM test passed, and draft PR #12 opened.']
            : ['role' => 'assistant', 'content' => null, 'tool_calls' => [[
                'id' => 'fixture-call-'.$step, 'type' => 'function', 'function' => [
                    'name' => $name, 'arguments' => json_encode($args)]]]];
        return Http::response(['id' => 'fixture-model-'.$step, 'usage' => ['cost' => 0.0002],
            'choices' => [['message' => $message]]]);
    }
    if (str_ends_with($url, '/issues/4')) return Http::response(['number' => 4,
        'title' => 'Fix note', 'body' => 'Replace broken with fixed and run tests/check.sh.',
        'state' => 'open', 'comments' => 0, 'user' => ['login' => 'fixture']]);
    if (str_ends_with($url, '/git/ref/heads/main')) return Http::response([
        'ref' => 'refs/heads/main', 'object' => ['type' => 'commit', 'sha' => $base]]);
    if (str_ends_with($url, '/git/ref/heads/'.$branch)) return $published
        ? Http::response(['ref' => 'refs/heads/'.$branch,
            'object' => ['type' => 'commit', 'sha' => $head]]) : Http::response([], 404);
    if (str_ends_with($url, '/git/commits/'.$base)) return Http::response([
        'sha' => $base, 'tree' => ['sha' => str_repeat('b', 40)]]);
    if ($request->method() === 'POST' && str_ends_with($url, '/git/blobs')) {
        $bytes = base64_decode($request->data()['content'] ?? '', true);
        if ($bytes !== "fixed\n") throw new RuntimeException('Wrong approved file bytes.');
        return Http::response(['sha' => sha1('blob '.strlen($bytes)."\0".$bytes)], 201);
    }
    if ($request->method() === 'POST' && str_ends_with($url, '/git/trees'))
        return Http::response(['sha' => $tree], 201);
    if ($request->method() === 'POST' && str_ends_with($url, '/git/commits'))
        return Http::response(['sha' => $head, 'message' => 'Fix issue #4',
            'tree' => ['sha' => $tree], 'parents' => [['sha' => $base]]], 201);
    if ($request->method() === 'POST' && str_ends_with($url, '/git/refs')) {
        $published = true;
        file_put_contents(getenv('BRANCH_FIXTURE_AUDIT'), "branch-ref\n", FILE_APPEND);
        return Http::response(['ref' => 'refs/heads/'.$branch,
            'object' => ['type' => 'commit', 'sha' => $head]], 201);
    }
    if ($request->method() === 'POST' && str_ends_with($url, '/pulls')) {
        file_put_contents(getenv('BRANCH_FIXTURE_AUDIT'), "draft-pr\n", FILE_APPEND);
        return Http::response(['number' => 12, 'title' => 'Fix issue #4',
            'body' => 'The focused shell test passed.', 'draft' => true,
            'html_url' => 'https://github.com/fixture/repo/pull/12',
            'head' => ['ref' => $branch, 'sha' => $head,
                'repo' => ['full_name' => 'fixture/repo']],
            'base' => ['ref' => 'main', 'sha' => $base,
                'repo' => ['full_name' => 'fixture/repo']]], 201);
    }
    throw new RuntimeException('Unexpected fixture HTTP request: '.$request->method().' '.$url);
});

Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'vibes',
    '--sleep' => 1, '--tries' => 1, '--max-time' => 300]);
