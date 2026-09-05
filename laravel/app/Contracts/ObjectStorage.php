<?php

namespace App\Contracts;

interface ObjectStorage
{
    public function configured(): bool;

    public function uploadPublic(
        string $bucket,
        string $path,
        string $contents,
        string $contentType,
        ?int $timeout = null,
    ): string;

    public function delete(string $bucket, string $path, ?int $timeout = null): void;

    public function pathFromPublicUrl(string $publicUrl, string $bucket): ?string;
}
