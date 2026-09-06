<?php

namespace App\Integrations\Gemini;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class GeminiClient
{
    private const DEFAULT_MODEL = 'gemini-3.6-flash';

    private const RETRYABLE_HTTP_STATUSES = [429, 500, 502, 503, 504];

    public function configured(): bool
    {
        return $this->apiKey() !== '';
    }

    public function primaryModel(): string
    {
        return trim((string) config('services.gemini.model')) ?: self::DEFAULT_MODEL;
    }

    public function generateContent(
        array $payload,
        int $timeout,
        int $attempts = 1,
        int $sleepMilliseconds = 0,
        ?string $model = null,
    ): Response {
        $request = Http::withHeaders(['x-goog-api-key' => $this->apiKey()])
            ->timeout($timeout);

        if ($attempts > 1) {
            $request = $request->retry($attempts, $sleepMilliseconds, throw: false);
        }

        return $request
            ->post($this->modelUrl($model ?? $this->primaryModel()), $payload)
            ->throw();
    }

    /**
     * @param  callable(string): array  $payload
     * @param  callable(Response): bool|null  $validator
     * @return array{response: Response, model: string}
     */
    public function generateWithModelFallback(
        callable $payload,
        int $timeout,
        ?callable $validator = null,
        array $logContext = [],
    ): array {
        $lastError = null;

        foreach ($this->models() as $index => $model) {
            $isFallback = $index > 0;

            for ($attempt = 1; ; $attempt++) {
                try {
                    $response = $this->generateContent($payload($model), $timeout, model: $model);

                    if ($validator !== null && ! $validator($response)) {
                        throw new GeminiBadResponseException(
                            'Gemini returned an unusable response (malformed JSON or content-filtered).'
                        );
                    }

                    return ['response' => $response, 'model' => $model];
                } catch (Throwable $exception) {
                    $lastError = $exception;
                    $failureClass = $this->classifyFailure($exception);

                    Log::warning('Gemini call failed.', $logContext + [
                        'model' => $model,
                        'attempt' => $attempt,
                        'class' => $failureClass,
                        'error' => $exception->getMessage(),
                    ]);

                    if ($failureClass === 'deterministic') {
                        throw $exception;
                    }

                    if ($failureClass === 'model_missing') {
                        Log::error('Gemini model unavailable (404) — update GEMINI_MODEL / GEMINI_FALLBACK_MODEL.', [
                            'model' => $model,
                        ]);
                        break;
                    }

                    $maxAttempts = match (true) {
                        $isFallback => 1,
                        $failureClass === 'rate_limit', $failureClass === 'bad_response' => 2,
                        default => 3,
                    };

                    if ($attempt >= $maxAttempts) {
                        break;
                    }

                    $delay = $this->retryDelayMicroseconds($failureClass, $attempt, $exception);
                    if ($delay > 0) {
                        usleep($delay);
                    }
                }
            }
        }

        throw $lastError ?? new RuntimeException('Gemini request failed: no model configured.');
    }

    /** @return 'transient'|'rate_limit'|'model_missing'|'deterministic'|'bad_response' */
    private function classifyFailure(Throwable $exception): string
    {
        if ($exception instanceof GeminiBadResponseException) {
            return 'bad_response';
        }

        if ($exception instanceof ConnectionException) {
            return 'transient';
        }

        if ($exception instanceof RequestException) {
            $status = $exception->response->status();

            return match (true) {
                $status === 429 => 'rate_limit',
                $status === 404 => 'model_missing',
                in_array($status, self::RETRYABLE_HTTP_STATUSES, true) => 'transient',
                $status >= 400 && $status < 500 => 'deterministic',
                default => 'transient',
            };
        }

        return 'transient';
    }

    private function retryDelayMicroseconds(string $failureClass, int $attempt, Throwable $exception): int
    {
        if (app()->runningUnitTests()) {
            return 0;
        }

        if ($failureClass === 'rate_limit' && $exception instanceof RequestException) {
            $retryAfter = (int) $exception->response->header('Retry-After');
            if ($retryAfter > 0) {
                return min($retryAfter, 30) * 1_000_000;
            }
        }

        return (2 ** ($attempt - 1)) * 1_000_000;
    }

    /** @return list<string> */
    private function models(): array
    {
        $fallback = trim((string) config('services.gemini.fallback_model'));

        return array_values(array_unique(array_filter([$this->primaryModel(), $fallback])));
    }

    private function modelUrl(string $model): string
    {
        if (! $this->configured()) {
            throw new RuntimeException('Gemini is not configured.');
        }

        return rtrim((string) config('services.gemini.url'), '/')
            .'/models/'.rawurlencode($model).':generateContent';
    }

    private function apiKey(): string
    {
        return (string) config('services.gemini.key');
    }
}
