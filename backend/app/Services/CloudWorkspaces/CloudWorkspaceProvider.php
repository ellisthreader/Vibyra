<?php
namespace App\Services\CloudWorkspaces;

interface CloudWorkspaceProvider
{
    public function configure(object $workspace): array;
    public function recover(object $workspace): ?array;
    public function inspect(object $workspace): string;
    public function stop(object $workspace): void;
    public function destroy(object $workspace): void;
}
