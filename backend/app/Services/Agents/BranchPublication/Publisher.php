<?php

namespace App\Services\Agents\BranchPublication;

/** Creates one GitHub branch from approved file bytes; never retries a write. */
final class Publisher
{
    public function __construct(private readonly GitDataClient $github) {}

    public function publish(string $token, string $repository, string $baseBranch,
        string $message, array $manifest): array
    {
        abort_unless(config('agents.git_publish_enabled'), 409, 'Agent branch publishing is not enabled.');
        abort_unless(self::repository($repository) && self::branch($baseBranch)
            && is_string($manifest['branch'] ?? null)
            && preg_match('#\Avibyra-agent/[a-f0-9-]{36}\z#D', $manifest['branch'])
            && is_string($message) && $message !== '' && trim($message) === $message
            && strlen($message) <= 200 && !str_contains($message, "\0"),
            422, 'Choose one repository, base branch and commit message.');
        $base = $manifest['baseSha'];
        $head = $manifest['branch'];
        $paths = array_column($manifest['files'], 'path');
        $publishPaths = $paths;
        foreach ($manifest['files'] as $file) {
            if ($file['previousPath'] !== null && in_array($file['previousPath'], $paths, true)) {
                return $this->refused('Overlapping rename paths need a fresh review.');
            }
            if ($file['previousPath'] !== null) $publishPaths[] = $file['previousPath'];
        }
        sort($publishPaths, SORT_STRING);
        for ($i = 1; $i < count($publishPaths); $i++) {
            if ($publishPaths[$i] === $publishPaths[$i - 1]
                || str_starts_with($publishPaths[$i], $publishPaths[$i - 1].'/')) {
                return $this->refused('Overlapping file and directory paths need a fresh review.');
            }
        }
        $baseRef = '/git/ref/heads/'.self::encodedBranch($baseBranch);
        $headRef = '/git/ref/heads/'.self::encodedBranch($head);
        if (!$this->matchesBase($token, $repository, $baseRef, $baseBranch, $base)) {
            return $this->refused('The approved base branch commit changed or cannot be read.');
        }
        if (!$this->headAbsent($token, $repository, $headRef)) {
            return $this->refused('The Agent branch already exists or cannot be checked.');
        }
        $commit = $this->github->get($token, $repository, '/git/commits/'.$base);
        $baseTree = $commit['data']['tree']['sha'] ?? null;
        if ($commit['status'] !== 200 || ($commit['data']['sha'] ?? null) !== $base
            || !self::sha($baseTree)) return $this->refused('The approved base commit is unavailable.');

        $tree = [];
        foreach ($manifest['files'] as $file) {
            if ($file['previousPath'] !== null) {
                $tree[$file['previousPath']] = self::deletion($file['previousPath']);
            }
            if ($file['content'] === null) {
                $tree[$file['path']] = self::deletion($file['path']);
                continue;
            }
            $blob = $this->github->post($token, $repository, '/git/blobs',
                ['content' => base64_encode($file['content']), 'encoding' => 'base64']);
            $sha = $blob['data']['sha'] ?? null;
            $expected = sha1('blob '.strlen($file['content'])."\0".$file['content']);
            if ($blob['status'] !== 201 || $sha !== $expected) {
                return $this->unknown('GitHub did not confirm the uploaded file bytes.');
            }
            $tree[$file['path']] = ['path' => $file['path'], 'mode' => $file['mode'],
                'type' => 'blob', 'sha' => $sha];
        }
        ksort($tree, SORT_STRING);
        $createdTree = $this->github->post($token, $repository, '/git/trees',
            ['base_tree' => $baseTree, 'tree' => array_values($tree)]);
        $treeSha = $createdTree['data']['sha'] ?? null;
        if ($createdTree['status'] !== 201 || !self::sha($treeSha)) {
            return $this->unknown('GitHub did not confirm the new file tree.');
        }
        if ($treeSha === $baseTree) return $this->refused('The reviewed snapshot makes no commit change.');
        $createdCommit = $this->github->post($token, $repository, '/git/commits',
            ['message' => $message, 'tree' => $treeSha, 'parents' => [$base]]);
        $commitSha = $createdCommit['data']['sha'] ?? null;
        if ($createdCommit['status'] !== 201 || !self::sha($commitSha)
            || ($createdCommit['data']['tree']['sha'] ?? null) !== $treeSha
            || ($createdCommit['data']['parents'][0]['sha'] ?? null) !== $base
            || ($createdCommit['data']['message'] ?? null) !== $message) {
            return $this->unknown('GitHub did not confirm the exact commit.');
        }
        if (!$this->matchesBase($token, $repository, $baseRef, $baseBranch, $base)
            || !$this->headAbsent($token, $repository, $headRef)) {
            return $this->refused('A branch moved before publication. No Agent ref was created.');
        }
        $createdRef = $this->github->post($token, $repository, '/git/refs',
            ['ref' => 'refs/heads/'.$head, 'sha' => $commitSha]);
        if ($createdRef['status'] !== 201
            || ($createdRef['data']['ref'] ?? null) !== 'refs/heads/'.$head
            || ($createdRef['data']['object']['type'] ?? null) !== 'commit'
            || ($createdRef['data']['object']['sha'] ?? null) !== $commitSha) {
            return $this->unknown('GitHub did not confirm the Agent branch ref.', $commitSha);
        }
        return ['published' => true, 'repository' => $repository, 'branch' => $head,
            'baseSha' => $base, 'headSha' => $commitSha,
            'commitUrl' => 'https://github.com/'.$repository.'/commit/'.$commitSha];
    }

    private function matchesBase(string $token, string $repository, string $path,
        string $branch, string $sha): bool
    {
        $response = $this->github->get($token, $repository, $path);
        return $response['status'] === 200
            && ($response['data']['ref'] ?? null) === 'refs/heads/'.$branch
            && ($response['data']['object']['type'] ?? null) === 'commit'
            && ($response['data']['object']['sha'] ?? null) === $sha;
    }

    private function headAbsent(string $token, string $repository, string $path): bool
    {
        return $this->github->get($token, $repository, $path)['status'] === 404;
    }

    private static function deletion(string $path): array
    {
        return ['path' => $path, 'mode' => '100644', 'type' => 'blob', 'sha' => null];
    }

    private static function encodedBranch(string $branch): string
    {
        return implode('/', array_map('rawurlencode', explode('/', $branch)));
    }

    private static function sha(mixed $sha): bool
    {
        return is_string($sha) && preg_match('/\A[a-f0-9]{40}\z/D', $sha) === 1;
    }

    private static function repository(string $repository): bool
    {
        return preg_match('#\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z#D', $repository) === 1
            && count(array_intersect(explode('/', $repository), ['.', '..'])) === 0;
    }

    private static function branch(string $branch): bool
    {
        return strlen($branch) <= 100 && preg_match('#\A[A-Za-z0-9][A-Za-z0-9._/-]*\z#D', $branch)
            && !str_contains($branch, '..') && !str_contains($branch, '//')
            && !str_ends_with($branch, '/') && !str_ends_with($branch, '.');
    }

    private function refused(string $reason): array
    {
        return ['published' => false, 'refused' => true, 'reason' => $reason];
    }

    private function unknown(string $reason, ?string $commitSha = null): array
    {
        return ['published' => false, 'error' => $reason.' Inspect the repository before retrying.',
            'commitSha' => $commitSha];
    }
}
