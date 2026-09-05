<?php

namespace App\Console\Commands\Achievements;

use App\Contracts\ObjectStorage;
use App\Models\Category;
use App\Models\Location;
use App\Models\LocationImage;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Populates one user's account with enough data to unlock every HiddenMY
 * Passport stamp, for demos / screenshots / grading — WITHOUT going through
 * the real submit → AI review → community-vote pipeline (which needs 10 real
 * voters per gem).
 *
 * The gems are fully filled in (description, address, postcode, opening hours,
 * phone, website, AI score breakdown) and each gets real photos: the command
 * uploads bundled stock images (database/seeders/demo-images/) to the same
 * Supabase Storage bucket a normal submission uses, so the photos behave
 * exactly like user-uploaded ones.
 *
 * Everything it creates is tagged `verification_model = 'demo:achievement-seed'`
 * and its place names are prefixed "[Demo]" so it's obvious to teammates and
 * removable in one command:  php artisan hiddenmy:seed-achievements <email> --undo
 * (--undo also deletes the uploaded files from Supabase Storage.)
 *
 * NOTE: this writes to whatever database + storage bucket .env points at. On
 * the shared Supabase the demo gems show up on the public map / browse page
 * for everyone until you run --undo. Prefer a local database.
 */
class SeedAchievementDemoData extends Command
{
    private ObjectStorage $storage;

    protected $signature = 'hiddenmy:seed-achievements
        {email : The user who should unlock the stamps}
        {--undo : Remove the demo data (and its uploaded photos) for that user instead}
        {--images=2 : Photos to upload per gem (0 to skip image uploads)}';

    protected $description = 'Seed (or remove) demo data that unlocks every HiddenMY achievement stamp for one user.';

    private const MARKER = 'demo:achievement-seed';

    /** [latitude, longitude, postcode] per state — a plausible point + a real
     *  state-prefixed postcode so the demo gems land on the map correctly. */
    private const STATE_META = [
        'Johor' => [1.9327, 103.3820, '81100'],
        'Kedah' => [6.1184, 100.3685, '05100'],
        'Kelantan' => [6.1254, 102.2386, '15200'],
        'Melaka' => [2.1896, 102.2501, '75300'],
        'Negeri Sembilan' => [2.7297, 101.9424, '70200'],
        'Pahang' => [3.8126, 103.3256, '25200'],
        'Penang' => [5.4164, 100.3327, '10200'],
        'Perak' => [4.5921, 101.0901, '30200'],
        'Perlis' => [6.4449, 100.2048, '01000'],
        'Selangor' => [3.0738, 101.5183, '40200'],
        'Terengganu' => [5.3117, 103.1324, '20200'],
        'Kuala Lumpur' => [3.1390, 101.6869, '50200'],
        'Putrajaya' => [2.9264, 101.6964, '62000'],
        'Sabah' => [5.9788, 116.0753, '88200'],
        'Sarawak' => [1.5533, 110.3592, '93200'],
        'Labuan' => [5.2831, 115.2308, '87000'],
    ];

    /** Spot archetypes per category name, so a demo gem's name/description
     *  matches the category it's filed under. */
    private const CATEGORY_SPOTS = [
        'food & beverage' => ['Kopitiam', 'Kampung Warung', 'Night Market Stall', 'Roadside Cendol Stand'],
        'nature' => ['Hidden Waterfall', 'Secret Beach Cove', 'Jungle Boardwalk', 'Limestone Cave'],
        'culture' => ['Heritage Shophouse', 'Village Temple', 'Batik Workshop', 'Old Trading Jetty'],
        'shopping' => ['Weekend Bazaar', 'Artisan Craft Market', 'Antique Row', 'Kampung Handicraft Stalls'],
        'entertainment' => ['Riverside Amphitheatre', 'Rooftop Outdoor Cinema', 'Firefly Boat Point', 'Sunset Kite Field'],
        'accommodation' => ['Kampung Homestay', 'Riverside Chalet', 'Longhouse Stay', 'Hillside Glamping Site'],
    ];

    /** Bundled photo (database/seeders/demo-images/) that best fits each category. */
    private const CATEGORY_IMAGE = [
        'food & beverage' => 'demo-food.jpg',
        'nature' => 'demo-waterfall.jpg',
        'culture' => 'demo-temple.jpg',
        'shopping' => 'demo-market.jpg',
        'entertainment' => 'demo-village.jpg',
        'accommodation' => 'demo-beach.jpg',
    ];

    /** All bundled photos, used to round out each gem to IMAGES_PER_GEM. */
    private const IMAGE_POOL = [
        'demo-waterfall.jpg', 'demo-beach.jpg', 'demo-food.jpg',
        'demo-market.jpg', 'demo-temple.jpg', 'demo-village.jpg',
    ];

    public function handle(ObjectStorage $storage): int
    {
        $this->storage = $storage;

        $user = User::where('email', $this->argument('email'))->first();

        if (! $user) {
            $this->error("No user with email {$this->argument('email')}.");

            return self::FAILURE;
        }

        return $this->option('undo') ? $this->undo($user) : $this->seed($user);
    }

    private function seed(User $user): int
    {
        $imagesPerGem = max(0, (int) $this->option('images'));

        // "Others" is excluded from the off-the-beaten-path stamp, so cycle the
        // demo gems through every OTHER category to cover it.
        $categories = Category::query()
            ->whereRaw('LOWER(TRIM(name)) <> ?', ['others'])
            ->orderBy('id')
            ->get(['id', 'name']);

        if ($categories->isEmpty()) {
            $this->error('No non-"Others" categories found — run the category seeder first.');

            return self::FAILURE;
        }

        if ($imagesPerGem > 0 && ! $this->storage->configured()) {
            $this->warn('SUPABASE_URL / SUPABASE_KEY not set — gems will be created without photos.');
            $imagesPerGem = 0;
        }

        if ($imagesPerGem > 0 && ! is_dir($this->imageDir())) {
            $this->warn('database/seeders/demo-images/ is missing — gems will be created without photos.');
            $imagesPerGem = 0;
        }

        // Re-runnable: clear any previous demo seed (and its files) first.
        $this->deleteDemoData($user);

        $states = array_keys(self::STATE_META);
        $uploaded = 0;

        $locations = DB::transaction(function () use ($user, $states, $categories) {
            $created = [];

            foreach ($states as $index => $state) {
                [$lat, $lng, $postcode] = self::STATE_META[$state];
                $category = $categories[$index % $categories->count()];

                $spots = self::CATEGORY_SPOTS[strtolower(trim($category->name))] ?? ['Hidden Spot'];
                $spot = $spots[$index % count($spots)];

                $created[$index] = Location::create([
                    'user_id' => $user->id,
                    'category_id' => $category->id,
                    'place_name' => "[Demo] {$spot} of {$state}",
                    'address' => "Lorong Permai {$this->houseNumber($index)}, Kampung Contoh, {$state}",
                    'state' => $state,
                    'postcode' => $postcode,
                    'description' => $this->description($spot, $state, $category->name),
                    'opening_hours' => $this->openingHours($index),
                    'phone' => '+60 1'.(2 + $index % 8).'-'.str_pad((string) (100 + $index), 3, '0', STR_PAD_LEFT).' '.str_pad((string) (1000 + $index * 7), 4, '0', STR_PAD_LEFT),
                    'website' => 'https://example.com/demo/'.strtolower(str_replace(' ', '-', $state)),
                    'latitude' => $lat,
                    'longitude' => $lng,
                    'status' => 'hidden_gem',
                    'vote_count' => 10,
                    'verification_threshold' => 10,
                    // Fill the AI breakdown so the detail page doesn't look half-empty.
                    'verification_score' => 78,
                    'verification_confidence' => 85,
                    'google_visibility_level' => 'VERY_LOW',
                    'hiddenness_score' => 100,
                    'legitimacy_score' => 74,
                    'legitimacy_level' => 'MODERATE',
                    'tourism_value_score' => 76,
                    'tourism_value_level' => 'MODERATE',
                    'evidence_score' => 70,
                    'evidence_level' => 'MODERATE',
                    'duplicate_status' => 'NO_DUPLICATE',
                    'verification_model' => self::MARKER,
                    'ai_review_reason' => 'Demo seed — presented as a verified Hidden Gem for the achievements showcase.',
                    'ai_reviewed_at' => now(),
                ]);
            }

            return $created;
        });

        // Photos are uploaded outside the transaction so it isn't held open for
        // the length of ~32 Storage round-trips.
        if ($imagesPerGem > 0) {
            $this->line('Uploading photos to Supabase Storage…');
            $bar = $this->output->createProgressBar(count($locations) * $imagesPerGem);

            foreach ($locations as $index => $location) {
                foreach ($this->photoFilesFor($location->category?->name, $index, $imagesPerGem) as $file) {
                    $url = $this->uploadDemoPhoto($file);

                    if ($url !== null) {
                        LocationImage::create(['location_id' => $location->id, 'image_url' => $url]);
                        $uploaded++;
                    }

                    $bar->advance();
                }
            }

            $bar->finish();
            $this->newLine(2);
        }

        // voice-of-the-community: 5 votes on 5 distinct locations. Vote on the
        // demo gems themselves (any distinct location_ids count).
        $voteTargets = Location::where('user_id', $user->id)
            ->where('verification_model', self::MARKER)
            ->orderBy('id')
            ->take(5)
            ->pluck('id');

        foreach ($voteTargets as $locationId) {
            Vote::firstOrCreate(
                ['user_id' => $user->id, 'location_id' => $locationId],
                ['travel_description' => '[Demo] Visited during the achievements showcase — lovely quiet spot.'],
            );
        }

        $this->info("Seeded {$user->name} <{$user->email}>:");
        $this->line('  • 16 [Demo] Hidden Gems (status=hidden_gem) — one per state, across all '
            .$categories->count().' non-Others categories');
        $this->line("  • {$uploaded} photo(s) uploaded to Supabase Storage");
        $this->line("  • {$voteTargets->count()} votes on distinct gems");
        $this->newLine();
        $this->line('All 8 Passport stamps should now be unlocked. Check "My Hidden Gems" → Achievements.');
        $this->warn('Remove it with:  php artisan hiddenmy:seed-achievements '.$user->email.' --undo');

        return self::SUCCESS;
    }

    private function undo(User $user): int
    {
        $counts = $this->deleteDemoData($user);

        $this->info("Removed demo achievement data for {$user->email}: "
            ."{$counts['votes']} vote(s), {$counts['images']} photo(s) "
            ."({$counts['files_deleted']} file(s) removed from Storage), "
            ."{$counts['hard']} location(s) deleted"
            .($counts['soft'] > 0 ? " ({$counts['soft']} marked deleted — still referenced elsewhere)" : '')
            .'.');

        return self::SUCCESS;
    }

    private function imageDir(): string
    {
        return database_path('seeders/demo-images');
    }

    /**
     * Which bundled photos a gem should get: its category's photo first, then
     * others from the pool, up to $count. Missing files are skipped.
     *
     * @return list<string> absolute file paths
     */
    private function photoFilesFor(?string $categoryName, int $index, int $count): array
    {
        $ordered = [];

        $primary = self::CATEGORY_IMAGE[strtolower(trim((string) $categoryName))] ?? null;
        if ($primary) {
            $ordered[] = $primary;
        }

        // Rotate through the pool for the remaining slots, offset per gem so
        // neighbouring states don't get identical second photos.
        foreach (self::IMAGE_POOL as $offset => $_) {
            $ordered[] = self::IMAGE_POOL[($index + $offset) % count(self::IMAGE_POOL)];
        }

        return collect($ordered)
            ->unique()
            ->map(fn (string $file) => $this->imageDir().DIRECTORY_SEPARATOR.$file)
            ->filter(fn (string $path) => is_file($path))
            ->take($count)
            ->values()
            ->all();
    }

    /**
     * Upload one local image file to Supabase Storage the same way
     * HiddenGemController::store() does. Returns the public URL, or null on
     * failure (the gem just gets fewer photos).
     */
    private function uploadDemoPhoto(string $localPath): ?string
    {
        $bucket = config('services.supabase.location_images_bucket', 'location_images');
        $path = 'hidden-gems/demo-'.Str::lower(Str::random(24)).'.jpg';

        try {
            return $this->storage->uploadPublic(
                $bucket,
                $path,
                file_get_contents($localPath),
                'image/jpeg',
                20,
            );
        } catch (\Throwable $e) {
            $this->warn("  photo upload failed ({$path}): {$e->getMessage()}");

            return null;
        }
    }

    /**
     * Remove the demo data. Uploaded photos are deleted from Supabase Storage
     * first, then the DB rows. Locations are hard-deleted when nothing else
     * references them; any that another user has since wishlisted / checked in
     * at / added to a trip fall back to the app's own status='deleted' so a FK
     * never blocks the cleanup.
     *
     * @return array{votes:int, images:int, files_deleted:int, hard:int, soft:int}
     */
    private function deleteDemoData(User $user): array
    {
        $locations = Location::where('user_id', $user->id)
            ->where('verification_model', self::MARKER)
            ->where('status', '!=', 'deleted')
            ->with('images')
            ->get();

        if ($locations->isEmpty()) {
            return ['votes' => 0, 'images' => 0, 'files_deleted' => 0, 'hard' => 0, 'soft' => 0];
        }

        $ids = $locations->pluck('id');
        $imageRows = $locations->flatMap->images;

        $filesDeleted = 0;
        foreach ($imageRows as $image) {
            if ($this->deleteStorageObject($image->image_url)) {
                $filesDeleted++;
            }
        }

        $votes = Vote::whereIn('location_id', $ids)->delete();
        $images = LocationImage::whereIn('location_id', $ids)->delete();

        $hard = 0;
        $soft = 0;

        foreach ($locations as $location) {
            try {
                $location->delete();
                $hard++;
            } catch (\Throwable $e) {
                $location->update(['status' => 'deleted']);
                $soft++;
            }
        }

        return [
            'votes' => $votes,
            'images' => $images,
            'files_deleted' => $filesDeleted,
            'hard' => $hard,
            'soft' => $soft,
        ];
    }

    /** Best-effort DELETE of one uploaded object from Supabase Storage. */
    private function deleteStorageObject(string $publicUrl): bool
    {
        $bucket = config('services.supabase.location_images_bucket', 'location_images');
        $path = $this->storage->pathFromPublicUrl($publicUrl, $bucket);

        if ($path === null || ! $this->storage->configured()) {
            return false;
        }

        try {
            $this->storage->delete($bucket, $path, 15);

            return true;
        } catch (\Throwable $e) {
            $this->warn("  could not delete storage file {$path}: {$e->getMessage()}");

            return false;
        }
    }

    private function houseNumber(int $index): int
    {
        return 3 + $index * 4;
    }

    private function openingHours(int $index): string
    {
        return [
            'Daily 8:00 AM – 6:00 PM',
            'Tue–Sun 9:00 AM – 5:30 PM (closed Mondays)',
            'Fri–Wed 10:00 AM – 10:00 PM',
            'Daily 7:00 AM – 12:00 PM, then 4:00 PM – 9:00 PM',
        ][$index % 4];
    }

    private function description(string $spot, string $state, string $category): string
    {
        return "A quiet {$state} spot known mostly to locals — this {$spot} rarely shows up in the usual "
            ."travel guides. Filed under {$category}. (Demo data for the HiddenMY Passport showcase; "
            .'safe to delete via the seeder --undo flag.)';
    }
}
