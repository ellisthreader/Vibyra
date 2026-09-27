<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

class OwnerProductionExporterPackageTest extends TestCase
{
    public function test_exporter_loads_its_packaged_helpers_before_refusing_nonproduction_access(): void
    {
        $exporter = dirname(__DIR__, 2).'/scripts/export-owner-production.php';
        $process = new Process([PHP_BINARY, $exporter], null, [
            'RAILWAY_ENVIRONMENT_NAME' => '',
            'DATABASE_PUBLIC_URL' => '',
        ]);
        $process->run();

        $this->assertSame(1, $process->getExitCode());
        $this->assertSame("Run this CLI export with Railway's production environment.\n", $process->getErrorOutput());
    }
}
