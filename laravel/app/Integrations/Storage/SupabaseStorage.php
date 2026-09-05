<?php

namespace App\Integrations\Storage;

use App\Contracts\ObjectStorage;
use Illuminate\Support\Facades\Http;

class SupabaseStorage implements ObjectStorage
{
    public function configured(): bool
    {
        return $this->baseUrl() !== '' && $this->key() !== '';
    }

    public function uploadPublic(
        string $bucket,
        string $path,
        string $contents,
        string $contentType,
        ?int $timeout = null,
    ): string {
        $response = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->key(),
            'apikey' => $this->key(),
            'Content-Type' => $contentType,
        ])->withBody($contents, $contentType);

        if ($timeout !== null) {
            $response = $response->timeout($timeout);
        }

        $response = $response->post($this->objectUrl($bucket, $path));

        if ($response->failed()) {
            throw new ObjectStorageException(
                'Object storage upload failed.',
                $response->status(),
                $response->json(),
            );
        }

        return $this->publicUrl($bucket, $path);
    }

    public function delete(string $bucket, string $path, ?int $timeout = null): void
    {
        $request = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->key(),
            'apikey' => $this->key(),
        ]);

        if ($timeout !== null) {
            $request = $request->timeout($timeout);
        }

        $response = $request->delete($this->objectUrl($bucket, $path));

        if ($response->failed()) {
            throw new ObjectStorageException(
                'Object storage delete failed.',
                $response->status(),
                $response->json(),
            );
        }
    }

    public function pathFromPublicUrl(string $publicUrl, string $bucket): ?string
    {
        $prefix = $this->baseUrl().'/storage/v1/object/public/'.rawurlencode($bucket).'/';

        return ! str_starts_with($publicUrl, $prefix)
            ? null
            : rawurldecode(substr($publicUrl, strlen($prefix)));
    }

    public function publicUrl(string $bucket, string $path): string
    {
        return $this->baseUrl().'/storage/v1/object/public/'
            .rawurlencode($bucket).'/'.$this->encodePath($path);
    }

    private function objectUrl(string $bucket, string $path): string
    {
        if (! $this->configured()) {
            throw new ObjectStorageException('Object storage is not configured.');
        }

        return $this->baseUrl().'/storage/v1/object/'
            .rawurlencode($bucket).'/'.$this->encodePath($path);
    }

    private function encodePath(string $path): string
    {
        return implode('/', array_map('rawurlencode', explode('/', ltrim($path, '/'))));
    }

    private function baseUrl(): string
    {
        return rtrim((string) config('services.supabase.url'), '/');
    }

    private function key(): string
    {
        return (string) config('services.supabase.key');
    }
}
