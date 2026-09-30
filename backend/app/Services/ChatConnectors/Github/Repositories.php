<?php

namespace App\Services\ChatConnectors\Github;

use Illuminate\Support\Facades\Http;

/**
 * Creating a repository for a project the desktop has just built.
 *
 * This is the one GitHub write that is not a chat tool, and it is deliberately
 * not one: `GithubConnector` answers a model, and a model must not be able to
 * make repositories. This is reached only by a person clicking a switch in the
 * New project wizard, so it takes no free text — a name and whether it is
 * private — and it creates an empty repository and nothing else. It never
 * pushes: the code is on the person's own computer and is pushed from there
 * with their own git credentials, so a server-held token never gains the power
 * to write somebody's source.
 *
 * The connector's OAuth scope is already `repo`, so no re-consent is needed.
 */
final class Repositories
{
    /** GitHub's own limit on a repository name, and the characters it keeps. */
    private const NAME = '#^[A-Za-z0-9._-]{1,100}$#';

    public function create(string $token, string $name, bool $private): array
    {
        if (!preg_match(self::NAME, $name)) {
            return ['error' => 'A repository name may use letters, numbers, dots, hyphens and underscores.'];
        }
        try {
            $response = Http::withToken($token)
                ->acceptJson()
                ->timeout(15)
                ->withOptions(['allow_redirects' => false])
                ->withHeaders(['Accept' => 'application/vnd.github+json', 'X-GitHub-Api-Version' => '2022-11-28'])
                ->post('https://api.github.com/user/repos', [
                    'name' => $name,
                    'private' => $private,
                    // The computer has the first commit already; an auto-init
                    // would put a README on an unrelated history and make the
                    // first push a conflict.
                    'auto_init' => false,
                ]);
        } catch (\Throwable) {
            return ['error' => 'GitHub did not respond in time. Try again.'];
        }

        if ($response->status() === 422) {
            return ['error' => 'You already have a repository with that name on GitHub. Rename the project or create it yourself.'];
        }
        if (!$response->successful()) {
            return ['error' => match ($response->status()) {
                401 => 'GitHub access expired or was revoked. Reconnect GitHub in Settings.',
                403 => 'This GitHub connection is not allowed to create repositories.',
                default => 'GitHub could not create the repository. Try again later.',
            }];
        }

        $data = $response->json();
        if (!is_array($data) || !isset($data['full_name'], $data['clone_url'])) {
            return ['error' => 'GitHub returned an unreadable response.'];
        }
        return ['data' => [
            'fullName' => (string) $data['full_name'],
            'htmlUrl' => (string) ($data['html_url'] ?? 'https://github.com/'.$data['full_name']),
            'cloneUrl' => (string) $data['clone_url'],
            'defaultBranch' => (string) ($data['default_branch'] ?? 'main'),
        ]];
    }
}
