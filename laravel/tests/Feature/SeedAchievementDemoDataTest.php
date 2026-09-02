<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Location;
use App\Models\LocationImage;
use App\Models\User;
use App\Models\Vote;
use App\Services\SpecialAchievementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SeedAchievementDemoDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.supabase.url' => 'https://demo.supabase.co',
            'services.supabase.key' => 'test-service-key',
            'services.supabase.location_images_bucket' => 'location_images',
        ]);

        // Supabase upload/delete — never hit the network. The demo photos are
        // read from the real database/seeders/demo-images/ directory.
        Http::fake([
            'demo.supabase.co/*' => Http::response(['Key' => 'ok'], 200),
        ]);
    }

    private function seedCategories(): void
    {
        foreach (['Food & Beverage', 'Nature', 'Culture', 'Shopping', 'Entertainment', 'Accommodation', 'Others'] as $name) {
            Category::factory()->create(['name' => $name]);
        }
    }

    private function makeUser(): User
    {
        $this->seedCategories();

        return User::factory()->create(['email' => 'demo@example.com']);
    }

    public function test_it_unlocks_every_achievement_stamp(): void
    {
        $user = $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com'])
            ->assertExitCode(0);

        $earned = app(SpecialAchievementService::class)->earnedKeys($user->fresh());

        $this->assertEqualsCanonicalizing(SpecialAchievementService::KEYS, $earned);
    }

    public function test_the_demo_gems_cover_every_state_and_meaningful_category(): void
    {
        $user = $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com']);

        $gems = Location::where('user_id', $user->id)->where('status', 'hidden_gem')->get();

        $this->assertCount(16, $gems);
        $this->assertCount(16, $gems->pluck('state')->unique());

        $othersId = Category::whereRaw('LOWER(name) = ?', ['others'])->value('id');
        $meaningfulIds = Category::whereKeyNot($othersId)->pluck('id');

        $this->assertEmpty($meaningfulIds->diff($gems->pluck('category_id')->unique()));
        $this->assertTrue($gems->every(fn ($g) => str_starts_with($g->place_name, '[Demo]')));
    }

    public function test_each_demo_gem_has_uploaded_photos_and_full_details(): void
    {
        $user = $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com']);

        $gems = Location::where('user_id', $user->id)->with('images')->get();

        foreach ($gems as $gem) {
            $this->assertCount(2, $gem->images);
            $this->assertStringStartsWith(
                'https://demo.supabase.co/storage/v1/object/public/location_images/hidden-gems/demo-',
                $gem->images->first()->image_url,
            );
            $this->assertNotEmpty($gem->description);
            $this->assertNotEmpty($gem->opening_hours);
            $this->assertNotEmpty($gem->phone);
            $this->assertNotEmpty($gem->website);
            $this->assertNotSame('00000', $gem->postcode);
            $this->assertNotNull($gem->verification_score);
            $this->assertSame('MODERATE', $gem->legitimacy_level);
        }

        $this->assertSame(32, LocationImage::count());

        // 32 uploads (2 per gem), no downloads — photos are bundled locally.
        Http::assertSentCount(32);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/storage/v1/object/location_images/hidden-gems/demo-'));
    }

    public function test_images_zero_skips_uploads(): void
    {
        $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com', '--images' => 0])
            ->assertExitCode(0);

        $this->assertSame(0, LocationImage::count());
        Http::assertNothingSent();
    }

    public function test_missing_supabase_config_skips_uploads_with_a_warning(): void
    {
        config(['services.supabase.url' => null, 'services.supabase.key' => null]);
        $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com'])
            ->expectsOutputToContain('SUPABASE_URL / SUPABASE_KEY not set')
            ->assertExitCode(0);

        $this->assertSame(16, Location::where('status', 'hidden_gem')->count());
        $this->assertSame(0, LocationImage::count());
    }

    public function test_undo_removes_data_and_deletes_uploaded_files(): void
    {
        $user = $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com']);
        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com', '--undo' => true])
            ->assertExitCode(0);

        $this->assertSame(0, Location::where('user_id', $user->id)->where('status', '!=', 'deleted')->count());
        $this->assertSame(0, Vote::where('user_id', $user->id)->count());
        $this->assertSame(0, LocationImage::count());
        $this->assertSame([], app(SpecialAchievementService::class)->earnedKeys($user->fresh()));

        // 32 DELETE calls to Storage, one per uploaded file.
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/storage/v1/object/location_images/hidden-gems/demo-'));
    }

    public function test_it_is_re_runnable_without_piling_up_data(): void
    {
        $user = $this->makeUser();

        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com']);
        $this->artisan('hiddenmy:seed-achievements', ['email' => 'demo@example.com']);

        $this->assertSame(16, Location::where('user_id', $user->id)->where('status', 'hidden_gem')->count());
        $this->assertSame(5, Vote::where('user_id', $user->id)->count());
        $this->assertSame(32, LocationImage::count());
    }

    public function test_unknown_email_fails_cleanly(): void
    {
        $this->artisan('hiddenmy:seed-achievements', ['email' => 'nobody@example.com'])
            ->assertExitCode(1);
    }
}
