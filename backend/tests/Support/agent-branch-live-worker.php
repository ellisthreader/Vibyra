<?php

/** Deterministic model with real GitHub HTTP for one private-repo Agent task. */
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\{Artisan, Http};

$repository = getenv('BRANCH_FIXTURE_REPO');
$base = getenv('BRANCH_FIXTURE_BASE_SHA');
$branch = getenv('BRANCH_FIXTURE_BRANCH');
$scriptHash = getenv('BRANCH_FIXTURE_SCRIPT_SHA');
$fixedHash = hash('sha256', "fixed\n");
if (!preg_match('#\Aellisthreader/vibyra-agent-qa-[a-z0-9-]+\z#D', $repository ?: '')) {
    throw new RuntimeException('Live worker needs a private Agent QA repository.');
}

Http::fake(['https://openrouter.ai/*' => function ($request) use (
    $repository, $base, $branch, $scriptHash, $fixedHash) {
    $messages = $request->data()['messages'] ?? [];
    $tools = array_values(array_filter($messages, fn ($item) => ($item['role'] ?? '') === 'tool'));
    $step = count($tools);
    $last = $step ? json_decode($tools[$step - 1]['content'], true) : [];
    $name = null; $args = [];
    if ($step === 0) { $name = 'github_issue'; $args = ['repository' => $repository, 'number' => 1]; }
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
        $name = 'publish_branch'; $args = ['repository' => $repository,
            'baseBranch' => 'main', 'message' => 'Fix issue #1',
            'snapshotSha256' => $last['snapshotSha256']];
    } elseif ($step === 6 && ($last['published'] ?? false) === true
        && ($last['baseSha'] ?? '') === $base && ($last['branch'] ?? '') === $branch) {
        $name = 'github_create_pull_request'; $args = ['repository' => $repository,
            'head' => $branch, 'base' => 'main', 'expectedHeadSha' => $last['headSha'],
            'expectedBaseSha' => $base, 'title' => 'Fix issue #1',
            'body' => 'The focused shell test passed.', 'draft' => true];
    } elseif ($step !== 7 || ($last['opened'] ?? false) !== true) {
        throw new RuntimeException('Unexpected live Agent tool receipt at step '.$step);
    }
    $message = $name === null
        ? ['role' => 'assistant', 'content' => 'Issue #1 fixed, VM test passed, and draft PR #'.$last['number'].' opened.']
        : ['role' => 'assistant', 'content' => null, 'tool_calls' => [[
            'id' => 'live-call-'.$step, 'type' => 'function', 'function' => [
                'name' => $name, 'arguments' => json_encode($args)]]]];
    return Http::response(['id' => 'live-model-'.$step, 'usage' => ['cost' => 0.0002],
        'choices' => [['message' => $message]]]);
}]);

Artisan::call('queue:work', ['connection' => 'database', '--queue' => 'vibes',
    '--sleep' => 1, '--tries' => 1, '--max-time' => 300]);
