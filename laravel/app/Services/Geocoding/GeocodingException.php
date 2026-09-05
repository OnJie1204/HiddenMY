<?php

namespace App\Services\Geocoding;

use RuntimeException;

class GeocodingException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
