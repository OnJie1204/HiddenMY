<?php

namespace App\Services;

/**
 * Instant, offline moderation for short user-authored text — comment bodies and
 * community-added menu-item names. This is the cheap first half of the hybrid
 * moderation model: a wordlist blocks the obvious cases synchronously, so no
 * AI call sits in the request path. Gem descriptions and photos still go
 * through the Gemini content_safety check (that is the expensive half).
 *
 * It is deliberately conservative — it targets slurs and hard profanity, not
 * mild rudeness — because a false positive blocks a legitimate review outright
 * with no appeal path.
 */
class ProfanityFilter
{
    /**
     * Word stems, matched on a word boundary against leet-normalised text.
     * Keep this list tight: unambiguous profanity and slurs only.
     */
    private const BLOCKLIST = [
        'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'motherfucker', 'bastard',
        'dickhead', 'bullshit', 'nigger', 'nigga', 'faggot', 'retard', 'whore',
        'slut', 'pussy', 'cock', 'wanker', 'twat', 'jerkoff',
        'kill yourself', 'kys',
        // common Malay vulgarities
        'pukimak', 'pantat', 'babi', 'sial', 'bodoh sombong', 'lancau', 'kimak',
        'cibai', 'puki',
    ];

    private const LEET_MAP = [
        '@' => 'a', '4' => 'a', '8' => 'b', '(' => 'c', '3' => 'e', '1' => 'i',
        '!' => 'i', '|' => 'i', '0' => 'o', '5' => 's', '$' => 's', '7' => 't',
    ];

    public function isClean(?string $text): bool
    {
        return $this->firstMatch($text) === null;
    }

    /** The first blocked term found, or null. Useful for a specific error message. */
    public function firstMatch(?string $text): ?string
    {
        if ($text === null || trim($text) === '') {
            return null;
        }

        $normalised = $this->normalise($text);
        // Also fold sequences of single letters ("s h i t" -> "shit") so the
        // most common separator evasion is caught, without de-spacing the
        // whole string (which would hit "Scunthorpe" for "cunt").
        $deSmuggled = preg_replace_callback(
            '/(?:\b[a-z] ){2,}\b[a-z]\b/',
            fn ($m) => str_replace(' ', '', $m[0]),
            $normalised
        );

        foreach (self::BLOCKLIST as $term) {
            $pattern = str_contains($term, ' ')
                ? '/' . preg_quote($term, '/') . '/'
                : '/(?<![a-z])' . preg_quote($term, '/') . '(?![a-z])/';

            if (preg_match($pattern, $normalised) || preg_match($pattern, $deSmuggled)) {
                return $term;
            }
        }

        return null;
    }

    private function normalise(string $text): string
    {
        $text = mb_strtolower($text);
        $text = strtr($text, self::LEET_MAP);
        // Collapse 3+ repeated letters ("shiiiit" -> "shit").
        $text = preg_replace('/([a-z])\1{2,}/', '$1', $text);
        $text = preg_replace('/[^a-z ]+/', ' ', $text);

        return trim(preg_replace('/\s+/', ' ', $text));
    }
}
