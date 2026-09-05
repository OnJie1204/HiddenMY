<?php

namespace App\Jobs\HiddenGems;

use RuntimeException;

/**
 * Thrown when Gemini returns HTTP 200 but the body is unusable — malformed or
 * unparseable JSON, a schema mismatch, or a safety-filtered response with no
 * text content. VerifyHiddenGemSubmission treats this like a transient failure:
 * a small number of retries, then the fallback model, then (if still unusable)
 * the submission is left 'pending' for a later retry — never 'ai_rejected'.
 */
class GeminiBadResponseException extends RuntimeException {}
