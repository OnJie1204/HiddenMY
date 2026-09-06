<?php

namespace Tests\Feature\System;

use Illuminate\Support\Collection;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;
use Tests\TestCase;

class ExternalServiceBoundaryTest extends TestCase
{
    public function test_outbound_http_is_confined_to_the_integrations_layer(): void
    {
        $violations = $this->phpFiles(app_path())
            ->reject(fn (string $path) => str_starts_with($path, app_path('Integrations').DIRECTORY_SEPARATOR))
            ->filter(fn (string $path) => str_contains(file_get_contents($path), 'Illuminate\Support\Facades\Http')
                || preg_match('/\bHttp::/', file_get_contents($path)) === 1)
            ->map(fn (string $path) => str_replace(base_path().DIRECTORY_SEPARATOR, '', $path))
            ->values()
            ->all();

        $this->assertSame([], $violations, 'Direct HTTP calls found outside app/Integrations: '.implode(', ', $violations));
    }

    public function test_environment_variables_are_only_read_through_configuration(): void
    {
        $violations = $this->phpFiles(app_path())
            ->filter(fn (string $path) => preg_match('/\benv\s*\(/', file_get_contents($path)) === 1)
            ->map(fn (string $path) => str_replace(base_path().DIRECTORY_SEPARATOR, '', $path))
            ->values()
            ->all();

        $this->assertSame([], $violations, 'Runtime env() calls found in application code: '.implode(', ', $violations));
    }

    /** @return Collection<int, string> */
    private function phpFiles(string $directory)
    {
        return collect(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory)))
            ->filter(fn (SplFileInfo $file) => $file->isFile() && $file->getExtension() === 'php')
            ->map(fn (SplFileInfo $file) => $file->getPathname())
            ->values();
    }
}
