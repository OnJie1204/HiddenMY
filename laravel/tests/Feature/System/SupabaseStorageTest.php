<?php

namespace Tests\Feature\System;

use App\Contracts\ObjectStorage;
use App\Integrations\Storage\ObjectStorageException;
use App\Integrations\Storage\SupabaseStorage;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SupabaseStorageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.supabase.url' => 'https://example.supabase.co/',
            'services.supabase.key' => 'test-key',
        ]);
    }

    public function test_object_storage_contract_resolves_to_supabase(): void
    {
        $this->assertInstanceOf(SupabaseStorage::class, app(ObjectStorage::class));
    }

    public function test_it_uploads_and_returns_the_existing_public_url_shape(): void
    {
        Http::fake(['example.supabase.co/*' => Http::response(['Key' => 'stored'])]);

        $url = app(SupabaseStorage::class)->uploadPublic(
            'location_images',
            'hidden-gems/photo.jpg',
            'image-bytes',
            'image/jpeg',
        );

        $this->assertSame(
            'https://example.supabase.co/storage/v1/object/public/location_images/hidden-gems/photo.jpg',
            $url,
        );
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && $request->hasHeader('Authorization', 'Bearer test-key')
            && $request->url() === 'https://example.supabase.co/storage/v1/object/location_images/hidden-gems/photo.jpg');
    }

    public function test_it_preserves_upstream_failure_details_for_callers(): void
    {
        Http::fake(['example.supabase.co/*' => Http::response(['message' => 'bucket missing'], 404)]);

        try {
            app(SupabaseStorage::class)->uploadPublic('missing', 'photo.jpg', 'bytes', 'image/jpeg');
            $this->fail('Expected the storage operation to fail.');
        } catch (ObjectStorageException $exception) {
            $this->assertSame(404, $exception->upstreamStatus);
            $this->assertSame(['message' => 'bucket missing'], $exception->upstreamError);
        }
    }

    public function test_it_extracts_an_object_path_only_for_the_expected_bucket(): void
    {
        $storage = app(SupabaseStorage::class);
        $url = 'https://example.supabase.co/storage/v1/object/public/comment_photos/folder/photo.jpg';

        $this->assertSame('folder/photo.jpg', $storage->pathFromPublicUrl($url, 'comment_photos'));
        $this->assertNull($storage->pathFromPublicUrl($url, 'avatars'));
        $this->assertNull($storage->pathFromPublicUrl(
            'https://another.supabase.co/storage/v1/object/public/comment_photos/folder/photo.jpg',
            'comment_photos',
        ));
    }
}
