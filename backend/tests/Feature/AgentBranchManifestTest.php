<?php

namespace Tests\Feature;

use App\Services\Agents\BranchPublication\Manifest;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AgentBranchManifestTest extends TestCase
{
    private const WORKSPACE = '123e4567-e89b-12d3-a456-426614174000';

    private function payload(): array
    {
        $content = "after\n";
        $file = ['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null,
            'sha256' => hash('sha256', $content), 'mode' => '100644', 'bytes' => strlen($content),
            'contentBase64' => base64_encode($content)];
        $base = str_repeat('a', 40);
        $branch = 'vibyra-agent/'.self::WORKSPACE;
        return ['baseSha' => $base, 'branch' => $branch, 'files' => [$file],
            'snapshotSha256' => Manifest::digest($base, $branch, [$file])];
    }

    private function rejects(array $payload, int $status): void
    {
        try { Manifest::validate($payload, self::WORKSPACE); $this->fail('Unsafe manifest passed.'); }
        catch (HttpException $error) { $this->assertSame($status, $error->getStatusCode()); }
    }

    public function test_digest_matches_the_mac_wire_vector(): void
    {
        $files = [['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null,
            'sha256' => str_repeat('b', 64), 'mode' => '100644', 'bytes' => 6]];
        $this->assertSame('5a71336f815c50623b7d933322f8e9cf4a9f231e5230769f9e4c661c8d2f8625',
            Manifest::digest(str_repeat('a', 40), 'vibyra-agent/'.self::WORKSPACE, $files));
    }

    public function test_exact_regular_file_bytes_validate_and_return_only_normalized_fields(): void
    {
        $manifest = Manifest::validate($this->payload(), self::WORKSPACE);
        $this->assertSame("after\n", $manifest['files'][0]['content']);
        $this->assertSame(6, $manifest['totalBytes']);
        $this->assertSame('notes.txt', $manifest['files'][0]['path']);
        $metadata = $this->payload();
        unset($metadata['files'][0]['contentBase64']);
        $preview = Manifest::metadata($metadata, self::WORKSPACE);
        $this->assertArrayNotHasKey('content', $preview['files'][0]);
        $this->assertSame($manifest['snapshotSha256'], $preview['snapshotSha256']);
    }

    public function test_changed_bytes_or_snapshot_cannot_be_published(): void
    {
        $payload = $this->payload();
        $payload['files'][0]['contentBase64'] = base64_encode("other\n");
        $this->rejects($payload, 422);
        $payload = $this->payload();
        $payload['files'][0]['sha256'] = str_repeat('b', 64);
        $payload['snapshotSha256'] = Manifest::digest($payload['baseSha'], $payload['branch'], $payload['files']);
        $this->rejects($payload, 422);
        $payload = $this->payload();
        $payload['snapshotSha256'] = str_repeat('b', 64);
        $this->rejects($payload, 409);
    }

    public function test_private_renamed_unsorted_and_wrong_branch_manifests_fail_closed(): void
    {
        $payload = $this->payload();
        $payload['files'][0]['path'] = '.env';
        $this->rejects($payload, 422);
        $payload = $this->payload();
        $payload['files'][0]['previousPath'] = 'private/.env';
        $this->rejects($payload, 422);
        $payload = $this->payload();
        $payload['files'][] = $payload['files'][0];
        $this->rejects($payload, 422);
        $payload = $this->payload();
        $payload['branch'] = 'vibyra-agent/someone-else';
        $this->rejects($payload, 422);
    }

    public function test_deletion_must_have_no_content_and_the_exact_deletion_status(): void
    {
        $payload = $this->payload();
        $payload['files'][0] = ['path' => 'notes.txt', 'status' => ' D', 'previousPath' => null,
            'sha256' => null, 'mode' => null, 'bytes' => 0, 'contentBase64' => null];
        $payload['snapshotSha256'] = Manifest::digest($payload['baseSha'], $payload['branch'], $payload['files']);
        $this->assertNull(Manifest::validate($payload, self::WORKSPACE)['files'][0]['content']);
        $payload['files'][0]['status'] = ' M';
        $this->rejects($payload, 422);
    }
}
