<?php

namespace App\Http\Controllers;

use App\Models\Location;
use App\Models\Report;
use App\Models\ReportVote;
use App\Support\Geo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class ReportController extends Controller
{
    private const VERIFICATION_THRESHOLD = 5;
    private const MAX_REPORTS_PER_DAY = 5;
    private const MIN_ACCOUNT_AGE_DAYS = 7;
    private const MAX_LOCATION_DISTANCE = 5.0;

    private const REPORTABLE_STATUSES = [
        'permanently_closed' => ['hidden_gem', 'pending_community_vote'],
        'inappropriate_content' => ['hidden_gem', 'pending_community_vote'],
    ];

    private function anyReportableStatuses(): array
    {
        return array_values(
            array_unique(
                array_merge(...array_values(self::REPORTABLE_STATUSES))
            )
        );
    }

    private function reasonsForStatus(string $status): array
    {
        return array_values(array_filter(
            Report::REASONS,
            fn (string $reason) =>
                in_array(
                    $status,
                    self::REPORTABLE_STATUSES[$reason] ?? [],
                    true
                )
        ));
    }

    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'eligible' => false,
                'message' => 'Please login first',
            ], 401);
        }

        $location = Location::with('images')->findOrFail($locationId);

        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' => 'You cannot report your own hidden gem',
            ], 403);
        }

        if (!in_array(
            $location->status,
            $this->anyReportableStatuses(),
            true
        )) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'Only Hidden Gems that have passed AI review can be reported.',
            ], 400);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'This gem is already marked permanently closed.',
            ], 400);
        }

        if ($location->report_status === 'under_review') {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'This gem already has a report under review.',
            ], 409);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'You have reached the daily limit for reports. Please try again tomorrow.',
            ], 429);
        }

        return response()->json([
            'eligible' => true,
            'is_established_account' =>
                $this->isEstablishedAccount($user),
            'message' => 'You can report this gem.',
            'location' => $location,
            'reasons' =>
                $this->reasonsForStatus($location->status),
            'location_required_reasons' =>
                Report::LOCATION_REQUIRED_REASONS,
            'max_distance' => self::MAX_LOCATION_DISTANCE,
        ]);
    }

    public function store(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first',
            ], 401);
        }

        $location = Location::findOrFail($locationId);

        try {
            $validated = $request->validate([
                'reason' =>
                    'required|string|in:' . implode(',', Report::REASONS),
                'description' =>
                    'nullable|string|max:1000',
                'photo' =>
                    'nullable|image|max:5120',

                'suggested_opening_hours' =>
                    'nullable|string|max:255',
                'suggested_phone' =>
                    'nullable|string|max:30',
                'suggested_website' =>
                    'nullable|url|max:255',
                'suggested_description' =>
                    'nullable|string|max:2000',

                'suggested_latitude' =>
                    'nullable|numeric|between:-90,90|required_with:suggested_longitude',
                'suggested_longitude' =>
                    'nullable|numeric|between:-180,180|required_with:suggested_latitude',

                'reporter_latitude' =>
                    'nullable|numeric|between:-90,90|required_with:reporter_longitude',
                'reporter_longitude' =>
                    'nullable|numeric|between:-180,180|required_with:reporter_latitude',
            ]);
        } catch (ValidationException $exception) {
            return response()->json([
                'message' => 'The report contains invalid information.',
                'errors' => $exception->errors(),
            ], 422);
        }

        $reason = $validated['reason'];
        $isVotingGem =
            $location->status === 'pending_community_vote';

        if ($location->user_id === $user->id) {
            return response()->json([
                'message' => 'You cannot report your own hidden gem',
            ], 403);
        }

        if (!in_array(
            $location->status,
            self::REPORTABLE_STATUSES[$reason] ?? [],
            true
        )) {
            return response()->json([
                'message' =>
                    'Only Hidden Gems that have passed AI review can be reported.',
            ], 400);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json([
                'message' =>
                    'This gem is already marked permanently closed.',
            ], 400);
        }

        if ($location->report_status === 'under_review') {
            return response()->json([
                'message' =>
                    'This gem already has a report under review.',
            ], 409);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json([
                'message' =>
                    'You have reached the daily limit for reports. Please try again tomorrow.',
            ], 429);
        }

        $wantsLocation =
            $isVotingGem
            && isset($validated['suggested_latitude'])
            && isset($validated['suggested_longitude']);

        $wantsDescription =
            $isVotingGem
            && !empty($validated['suggested_description']);

        $wantsContact =
            ($validated['suggested_opening_hours'] ?? null) !== null
            || ($validated['suggested_phone'] ?? null) !== null
            || ($validated['suggested_website'] ?? null) !== null;

        if ($reason === 'inappropriate_content') {
            if (
                !$isVotingGem
                && (
                    isset($validated['suggested_latitude'])
                    || !empty($validated['suggested_description'])
                )
            ) {
                return response()->json([
                    'message' =>
                        'A verified Hidden Gem can only be reported for incorrect contact info.',
                ], 400);
            }

            if (
                !$wantsLocation
                && !$wantsDescription
                && !$wantsContact
            ) {
                return response()->json([
                    'message' => $isVotingGem
                        ? 'Add at least one correction — location, description or contact info.'
                        : 'Add at least one corrected contact detail.',
                ], 400);
            }
        }

        $requiresLocationVerification =
            in_array(
                $reason,
                Report::LOCATION_REQUIRED_REASONS,
                true
            )
            || $wantsLocation;

        if (
            !$requiresLocationVerification
            && !$this->isEstablishedAccount($user)
        ) {
            return response()->json([
                'message' =>
                    'This report reason is limited to accounts that are at least '
                    . self::MIN_ACCOUNT_AGE_DAYS
                    . ' days old.',
            ], 403);
        }

        $distance = null;

        if ($requiresLocationVerification) {
            if (
                !isset($validated['reporter_latitude'])
                || !isset($validated['reporter_longitude'])
            ) {
                return response()->json([
                    'message' =>
                        'Your current location is required for this report.',
                ], 422);
            }

            if (
                $location->latitude === null
                || $location->longitude === null
            ) {
                return response()->json([
                    'message' =>
                        'This hidden gem does not have valid coordinates for location verification.',
                ], 422);
            }

            $distance = $this->calculateDistance(
                (float) $validated['reporter_latitude'],
                (float) $validated['reporter_longitude'],
                (float) $location->latitude,
                (float) $location->longitude
            );

            if ($distance > self::MAX_LOCATION_DISTANCE) {
                return response()->json([
                    'message' =>
                        'You must be within 5 km of this hidden gem to submit this report.',
                    'distance' => round($distance, 2),
                    'max_distance' =>
                        self::MAX_LOCATION_DISTANCE,
                ], 422);
            }
        }

        $photoPath = null;

        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $fileName =
                'votes/'
                . uniqid()
                . '.'
                . $photo->getClientOriginalExtension();

            $response = Http::withHeaders([
                'Authorization' =>
                    'Bearer ' . env('SUPABASE_KEY'),
                'apikey' => env('SUPABASE_KEY'),
                'Content-Type' => $photo->getMimeType(),
            ])->withBody(
                file_get_contents($photo->getRealPath()),
                $photo->getMimeType()
            )->post(
                env('SUPABASE_URL')
                . '/storage/v1/object/vote_photos/'
                . $fileName
            );

            if ($response->failed()) {
                return response()->json([
                    'message' =>
                        'Failed to upload report photo.',
                    'error' => $response->json(),
                ], 500);
            }

            $photoPath =
                env('SUPABASE_URL')
                . '/storage/v1/object/public/vote_photos/'
                . $fileName;
        }

        $isContentReport =
            $reason === 'inappropriate_content';

        $report = Report::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'reason' => $reason,
            'description' =>
                $validated['description'] ?? null,
            'photo_path' => $photoPath,

            'suggested_opening_hours' =>
                $isContentReport && $wantsContact
                    ? ($validated['suggested_opening_hours'] ?? null)
                    : null,

            'suggested_phone' =>
                $isContentReport && $wantsContact
                    ? ($validated['suggested_phone'] ?? null)
                    : null,

            'suggested_website' =>
                $isContentReport && $wantsContact
                    ? ($validated['suggested_website'] ?? null)
                    : null,

            'suggested_description' =>
                $isContentReport && $wantsDescription
                    ? $validated['suggested_description']
                    : null,

            'suggested_latitude' =>
                $isContentReport && $wantsLocation
                    ? $validated['suggested_latitude']
                    : null,

            'suggested_longitude' =>
                $isContentReport && $wantsLocation
                    ? $validated['suggested_longitude']
                    : null,

            'confirm_count' => 0,
            'dispute_count' => 0,
        ]);

        $location->update([
            'report_status' => 'under_review',
        ]);

        return response()->json([
            'message' =>
                'Report submitted. The community will now vote to confirm or dispute it.',
            'report' => $report,
            'location' => $location->fresh(),
            'distance' =>
                $distance !== null
                    ? round($distance, 2)
                    : null,
            'max_distance' =>
                $requiresLocationVerification
                    ? self::MAX_LOCATION_DISTANCE
                    : null,
        ], 201);
    }

    public function show($locationId)
    {
        $report = Report::with('user:id,name')
            ->where('location_id', $locationId)
            ->latest()
            ->first();

        if (!$report) {
            return response()->json([
                'data' => null,
            ]);
        }

        $myVerdict = Auth::check()
            ? ReportVote::where(
                'report_id',
                $report->id
            )
                ->where('user_id', Auth::id())
                ->value('verdict')
            : null;

        return response()->json([
            'data' => $report,
            'root_report' => $report,
            'my_verdict' => $myVerdict,
        ]);
    }

    public function checkVerifyEligibility(Report $report)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'eligible' => false,
                'message' => 'Please login first',
            ], 401);
        }

        if (!$report->isPending()) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'This report has already been resolved.',
            ], 400);
        }

        if ($report->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'You cannot verify your own report.',
            ], 403);
        }

        $location =
            $report->location()
                ->with('images')
                ->firstOrFail();

        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'You cannot verify a report on your own hidden gem.',
            ], 403);
        }

        $alreadyVoted =
            ReportVote::where(
                'report_id',
                $report->id
            )
                ->where('user_id', $user->id)
                ->exists();

        if ($alreadyVoted) {
            return response()->json([
                'eligible' => false,
                'message' =>
                    'You have already voted on this report.',
            ], 409);
        }

        return response()->json([
            'eligible' => true,
            'requires_location_verification' =>
                $report->requiresLocationVerification(),
            'max_distance' =>
                self::MAX_LOCATION_DISTANCE,
            'message' =>
                'You can verify this report.',
            'report' => $report,
            'location' => $location,
        ]);
    }

    public function verify(Request $request, Report $report)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json([
                'message' => 'Please login first',
            ], 401);
        }

        try {
            $validated = $request->validate([
                'verdict' =>
                    'required|string|in:'
                    . implode(',', ReportVote::VERDICTS),
                'comment' =>
                    'nullable|string|max:1000',
                'latitude' =>
                    'nullable|numeric|between:-90,90|required_with:longitude',
                'longitude' =>
                    'nullable|numeric|between:-180,180|required_with:latitude',
            ]);
        } catch (ValidationException $exception) {
            return response()->json([
                'message' =>
                    'The verification request contains invalid information.',
                'errors' => $exception->errors(),
            ], 422);
        }

        if (!$report->isPending()) {
            return response()->json([
                'message' =>
                    'This report has already been resolved.',
            ], 400);
        }

        if ($report->user_id === $user->id) {
            return response()->json([
                'message' =>
                    'You cannot verify your own report.',
            ], 403);
        }

        $location = $report->location;

        if ($location->user_id === $user->id) {
            return response()->json([
                'message' =>
                    'You cannot verify a report on your own hidden gem.',
            ], 403);
        }

        $alreadyVoted =
            ReportVote::where(
                'report_id',
                $report->id
            )
                ->where('user_id', $user->id)
                ->exists();

        if ($alreadyVoted) {
            return response()->json([
                'message' =>
                    'You have already voted on this report.',
            ], 409);
        }

        $distance = null;

        if ($report->requiresLocationVerification()) {
            if (
                !isset($validated['latitude'])
                || !isset($validated['longitude'])
            ) {
                return response()->json([
                    'message' =>
                        'Your current location is required to verify this report.',
                ], 422);
            }

            if (
                $location->latitude === null
                || $location->longitude === null
            ) {
                return response()->json([
                    'message' =>
                        'This hidden gem does not have valid coordinates for location verification.',
                ], 422);
            }

            $distance = $this->calculateDistance(
                (float) $validated['latitude'],
                (float) $validated['longitude'],
                (float) $location->latitude,
                (float) $location->longitude
            );

            if ($distance > self::MAX_LOCATION_DISTANCE) {
                return response()->json([
                    'message' =>
                        'You must be within 5 km of this hidden gem to verify this report.',
                    'distance' => round($distance, 2),
                    'max_distance' =>
                        self::MAX_LOCATION_DISTANCE,
                ], 422);
            }
        }

        $vote = ReportVote::create([
            'report_id' => $report->id,
            'user_id' => $user->id,
            'verdict' => $validated['verdict'],
            'comment' =>
                $validated['comment'] ?? null,
        ]);

        if ($validated['verdict'] === 'confirm') {
            $report->increment('confirm_count');
        } else {
            $report->increment('dispute_count');
        }

        $this->resolveIfThresholdReached(
            $report->fresh(),
            $location
        );

        return response()->json([
            'message' => 'Vote recorded.',
            'vote' => $vote,
            'report' => $report->fresh(),
            'location' => $location->fresh(),
            'distance' =>
                $distance !== null
                    ? round($distance, 2)
                    : null,
            'max_distance' =>
                $report->requiresLocationVerification()
                    ? self::MAX_LOCATION_DISTANCE
                    : null,
        ], 201);
    }

    private function reportRateLimitExceeded(int $userId): bool
    {
        return Report::where('user_id', $userId)
            ->where(
                'created_at',
                '>=',
                now()->subDay()
            )
            ->count() >= self::MAX_REPORTS_PER_DAY;
    }

    private function isEstablishedAccount($user): bool
    {
        return $user->created_at
            && $user->created_at->lte(
                now()->subDays(
                    self::MIN_ACCOUNT_AGE_DAYS
                )
            );
    }

    private function resolveIfThresholdReached(
        Report $report,
        Location $location
    ): void {
        if (
            $report->confirm_count
            >= self::VERIFICATION_THRESHOLD
        ) {
            $this->applyConfirmed(
                $report,
                $location
            );
        } elseif (
            $report->dispute_count
            >= self::VERIFICATION_THRESHOLD
        ) {
            $this->applyDisputed(
                $report,
                $location
            );
        }
    }

    private function applyConfirmed(
        Report $report,
        Location $location
    ): void {
        $report->update([
            'status' => 'upheld',
            'resolved_at' => now(),
        ]);

        if (
            $report->reason
            === 'permanently_closed'
        ) {
            $location->update([
                'report_status' => null,
                'permanently_closed_at' =>
                    now(),
            ]);

            return;
        }

        if (
            $report->reason
            === 'inappropriate_content'
        ) {
            $location->update([
                'report_status' => null,
                'contact_edit_unlocked_at' =>
                    now(),
            ]);
        }
    }

    private function applyDisputed(
        Report $report,
        Location $location
    ): void {
        $report->update([
            'status' => 'rejected',
            'resolved_at' => now(),
        ]);

        $location->update([
            'report_status' => null,
        ]);
    }

    private function calculateDistance(
        float $lat1,
        float $lon1,
        float $lat2,
        float $lon2
    ): float {
        return Geo::distanceMeters(
            $lat1,
            $lon1,
            $lat2,
            $lon2
        ) / 1000;
    }
}
