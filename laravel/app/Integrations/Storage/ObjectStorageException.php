<?php

namespace App\Integrations\Storage;

use RuntimeException;

class ObjectStorageException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $upstreamStatus = null,
        public readonly mixed $upstreamError = null,
    ) {
        parent::__construct($message);
    }
}
