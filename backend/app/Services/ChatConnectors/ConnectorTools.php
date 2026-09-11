<?php

namespace App\Services\ChatConnectors;

/**
 * The bridge between a turn and the connectors. An integration reaches a model only
 * when the person named it in the message and the account has really connected
 * it, so an install alone never quietly widens what a reply can read.
 */
class ConnectorTools
{
    public function __construct(private readonly Registry $registry, private readonly Installs $installs) {}

    /**
     * Which of the mentioned integrations this turn may use: installed, known, unique,
     * and capped, because every schema is sent with the prompt and therefore paid for.
     */
    public function resolve(int $userId, array $requested): array
    {
        $installed = $this->installs->installed($userId);
        $allowed = array_values(array_unique(array_filter(
            array_map(fn ($slug) => is_string($slug) ? strtolower(trim($slug)) : '', $requested),
            fn ($slug) => $slug !== '' && in_array($slug, $installed, true),
        )));
        return array_slice($allowed, 0, max(1, (int) config('chat_connectors.max_per_turn', 3)));
    }

    public function definitions(array $slugs): array
    {
        return $this->registry->definitions($slugs);
    }

    /**
     * The integration that owns a tool call, or null for a project tool. The caller has
     * already proved the name was one this turn offered, which is the real gate.
     */
    public function ownerOf(string $operation): ?string
    {
        return $this->registry->ownerOf($operation);
    }

    public function validate(string $slug, string $operation, array $arguments): array
    {
        return $this->registry->for($slug)->validate($operation, $arguments);
    }

    /**
     * Run one call. A provider that is down, slow or refusing must not fail the
     * whole turn: the model is told plainly and can say so in its reply.
     */
    public function run(int $userId, string $slug, string $operation, array $arguments): array
    {
        try {
            $credential = $this->installs->credential($userId, $slug);
            $outcome = $this->registry->for($slug)->run($operation, $arguments, $credential);
            return ['result' => (array) ($outcome['result'] ?? []), 'summary' => (string) ($outcome['summary'] ?? $operation)];
        } catch (\Throwable $e) {
            $name = (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug);
            $message = $e instanceof \Symfony\Component\HttpKernel\Exception\HttpException
                ? $e->getMessage() : $name.' could not be reached just now.';
            return ['result' => ['error' => $message], 'summary' => $name.' could not answer'];
        }
    }
}
