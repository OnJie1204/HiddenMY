<?php

namespace Tests\Unit\Community;

use App\Services\Community\ProfanityFilter;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

class ProfanityFilterTest extends TestCase
{
    private ProfanityFilter $filter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->filter = new ProfanityFilter;
    }

    #[DataProvider('cleanStrings')]
    public function test_clean_text_passes(string $text): void
    {
        $this->assertTrue($this->filter->isClean($text), "Expected clean: {$text}");
    }

    public static function cleanStrings(): array
    {
        return [
            [''],
            ['Great nasi lemak, generous portions and friendly staff.'],
            ['The classic char kway teow here is the best in Penang.'],
            ['Scunthorpe United played here once.'], // must not trip "cunt"
            ['This assortment of kuih is lovely.'],   // must not trip "ass"
            ['Hidden waterfall, worth the hike.'],
        ];
    }

    #[DataProvider('dirtyStrings')]
    public function test_profane_text_is_blocked(string $text): void
    {
        $this->assertFalse($this->filter->isClean($text), "Expected blocked: {$text}");
    }

    public static function dirtyStrings(): array
    {
        return [
            ['this place is shit'],
            ['what the fuck was that'],
            ['f u c k this'],
            ['sh1t service'],
            ['shiiiiit tier food'],
            ['babi punya tempat'],
        ];
    }
}
