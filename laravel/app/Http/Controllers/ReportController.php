<?php

namespace App\Http\Controllers;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\Report;
use App\Models\ReportVote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

class ReportController extends Controller
{
    private const VERIFICATION_THRESHOLD = 5;
    private const TIER_A_REPORT_THRESHOLD = 5;
    private const MAX_REPORTS_PER_DAY = 5;
    private const MIN_ACCOUNT_AGE_DAYS = 7;

    private const REPORTABLE_STATUSES = ['hidden_gem', 'pending_community_vote'];

    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['eligible' => false, 'message' => 'Please login first'], 401);
        }

        $location = Location::with('images')->findOrFail($locationId);

        if ($location->user_id === $user->id) {
            return response()->json([
                'eligible' => false,
                'message' => 'You cannot report your own hidden gem',
            ]);
        }

        if (!in_array($location->status, self::REPORTABLE_STATUSES, true)) {
            return response()->json([
                'eligible' => false,
                'message' => 'Only gems that have passed AI review can be reported.',
            ]);
        }

        if ($location->report_status === 'under_review') {
            return response()->json([
                'eligible' => false,
                'message' => 'This gem already has a report under review.',
            ]);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json([
                'eligible' => false,
                'message' => 'You have reached the daily limit for reports. Please try again tomorrow.',
            ]);
        }

        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        return response()->json([
            'eligible' => true,
            'has_check_in' => $hasCheckIn,
            'is_established_account' => $this->isEstablishedAccount($user),
            'message' => $hasCheckIn ? 'You can report this gem.' : 'Please check-in at this location first',
            'location' => $location,
            'reasons' => Report::REASONS,
            'location_required_reasons' => Report::LOCATION_REQUIRED_REASONS,
        ]);
    }

    public function store(Request $request, $locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

        $validated = $request->validate([
            'reason' => 'required|string|in:' . implode(',', Report::REASONS),
            'description' => 'nullable|string|max:1000',
            'photo' => 'nullable|image|max:5120',
            'suggested_latitude' => 'required_if:reason,incorrect_location|nullable|numeric|between:-90,90',
            'suggested_longitude' => 'required_if:reason,incorrect_location|nullable|numeric|between:-180,180',
            'flagged_item' => 'required_if:reason,inappropriate_content|nullable|string|max:100',
        ]);

        $reason = $validated['reason'];

        if ($location->user_id === $user->id) {
            return response()->json(['message' => 'You cannot report your own hidden gem'], 403);
        }

        if (!in_array($location->status, self::REPORTABLE_STATUSES, true)) {
            return response()->json(['message' => 'Only gems that have passed AI review can be reported.'], 400);
        }

        if (in_array($reason, Report::TIER_B_REASONS, true) && $location->report_status === 'under_review') {
            return response()->json(['message' => 'This gem already has a report under review.'], 400);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json(['message' => 'You have reached the daily limit for reports. Please try again tomorrow.'], 429);
        }

        $requiresCheckIn = in_array($reason, Report::LOCATION_REQUIRED_REASONS, true);

        if (!$requiresCheckIn && !$this->isEstablishedAccount($user)) {
            return response()->json([
                'message' => "This reason doesn't require a check-in, so it's limited to accounts that are at least "
                    . self::MIN_ACCOUNT_AGE_DAYS . ' days old or have checked in somewhere before.',
            ], 403);
        }

        if ($requiresCheckIn) {
            $hasCheckIn = CheckIn::where('user_id', $user->id)
                ->where('location_id', $locationId)
                ->exists();

            if (!$hasCheckIn) {
                return response()->json(['message' => 'Please check-in at this location first before reporting'], 400);
            }
        }

        if (in_array($reason, Report::TIER_A_REASONS, true)) {
            $alreadyReported = Report::where('location_id', $locationId)
                ->where('reason', $reason)
                ->where('user_id', $user->id)
                ->whereNull('resolved_at')
                ->exists();

            if ($alreadyReported) {
                return response()->json(['message' => 'You have already reported this.'], 400);
            }
        }

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $fileName = 'votes/' . uniqid() . '.' . $photo->getClientOriginalExtension();

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . env('SUPABASE_KEY'),
                'apikey' => env('SUPABASE_KEY'),
                'Content-Type' => $photo->getMimeType(),
            ])->withBody(
                file_get_contents($photo->getRealPath()),
                $photo->getMimeType()
            )->post(
                env('SUPABASE_URL') . '/storage/v1/object/vote_photos/' . $fileName
            );

            if ($response->failed()) {
                return response()->json([
                    'message' => 'Failed to upload report photo.',
                    'error' => $response->json(),
                ], 500);
            }

            $photoPath = env('SUPABASE_URL')
                . '/storage/v1/object/public/vote_photos/'
                . $fileName;
        }

        $report = Report::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'reason' => $reason,
            'description' => $validated['description'] ?? null,
            'photo_path' => $photoPath,
            'suggested_latitude' => $validated['suggested_latitude'] ?? null,
            'suggested_longitude' => $validated['suggested_longitude'] ?? null,
            'flagged_item' => $validated['flagged_item'] ?? null,
            'confirm_count' => in_array($reason, Report::TIER_B_REASONS, true) ? 1 : 0,
        ]);

        if (in_array($reason, Report::TIER_B_REASONS, true)) {
            ReportVote::create([
                'report_id' => $report->id,
                'user_id' => $user->id,
                'verdict' => 'confirm',
            ]);

            $location->update(['report_status' => 'under_review']);

            return response()->json([
                'message' => 'Report submitted. The community will now vote to confirm or dispute it.',
                'report' => $report,
                'location' => $location->fresh(),
            ], 201);
        }

        $reportCount = Report::where('location_id', $locationId)
            ->where('reason', $reason)
            ->whereNull('resolved_at')
            ->count();

        if ($reportCount >= self::TIER_A_REPORT_THRESHOLD) {
            $this->resolveTierA($reason, $location);
        }

        return response()->json([
            'message' => 'Report recorded.',
            'report' => $report,
            'location' => $location->fresh(),
        ], 201);
    }

    public function show($locationId)
    {
        $report = Report::with('user:id,name')
            ->where('location_id', $locationId)
            ->whereNull('parent_report_id')
            ->latest()
            ->first();

        if (!$report) {
            return response()->json(['data' => null]);
        }

        // The currently-active cycle for this report: the latest fix-review
        // child if one's in progress, otherwise the root report itself.
        $activeReport = $report->children()->latest()->first() ?? $report;

        $myVerdict = Auth::check()
            ? ReportVote::where('report_id', $activeReport->id)->where('user_id', Auth::id())->value('verdict')
            : null;

        return response()->json([
            'data' => $activeReport,
            'root_report' => $report,
            'my_verdict' => $myVerdict,
        ]);
    }

    /** Same shape as checkEligibility() above, for the confirm/dispute vote
     *  instead of the initial report. */
    public function checkVerifyEligibility(Report $report)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['eligible' => false, 'message' => 'Please login first'], 401);
        }

        if (!$report->isPending()) {
            return response()->json(['eligible' => false, 'message' => 'This report has already been resolved.']);
        }

        if ($report->user_id === $user->id) {
            return response()->json(['eligible' => false, 'message' => 'You cannot verify your own report.']);
        }

        $location = $report->location()->with('images')->first();

        if ($location->user_id === $user->id) {
            return response()->json(['eligible' => false, 'message' => 'You cannot verify a report on your own hidden gem.']);
        }

        $alreadyVoted = ReportVote::where('report_id', $report->id)->where('user_id', $user->id)->exists();

        if ($alreadyVoted) {
            return response()->json(['eligible' => false, 'message' => 'You have already voted on this report.']);
        }

        $requiresCheckIn = in_array($report->reason, Report::LOCATION_REQUIRED_REASONS, true);
        $hasCheckIn = !$requiresCheckIn || CheckIn::where('user_id', $user->id)
            ->where('location_id', $location->id)
            ->exists();

        return response()->json([
            'eligible' => true,
            'has_check_in' => $hasCheckIn,
            'message' => $hasCheckIn ? 'You can verify this report.' : 'Please check-in at this location first',
            'report' => $report,
            'location' => $location,
        ]);
    }

    public function verify(Request $request, Report $report)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $validated = $request->validate([
            'verdict' => 'required|string|in:' . implode(',', ReportVote::VERDICTS),
            'comment' => 'nullable|string|max:1000',
        ]);

        if (!$report->isPending()) {
            return response()->json(['message' => 'This report has already been resolved.'], 400);
        }

        if ($report->user_id === $user->id) {
            return response()->json(['message' => 'You cannot verify your own report.'], 403);
        }

        $location = $report->location;

        if ($location->user_id === $user->id) {
            return response()->json(['message' => 'You cannot verify a report on your own hidden gem.'], 403);
        }

        $alreadyVoted = ReportVote::where('report_id', $report->id)->where('user_id', $user->id)->exists();

        if ($alreadyVoted) {
            return response()->json(['message' => 'You have already voted on this report.'], 400);
        }

        $requiresCheckIn = in_array($report->reason, Report::LOCATION_REQUIRED_REASONS, true);
        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $location->id)
            ->exists();

        if ($requiresCheckIn && !$hasCheckIn) {
            return response()->json(['message' => 'Please check-in at this location first before verifying'], 400);
        }

        $vote = ReportVote::create([
            'report_id' => $report->id,
            'user_id' => $user->id,
            'verdict' => $validated['verdict'],
            'comment' => $validated['comment'] ?? null,
        ]);

        if ($validated['verdict'] === 'confirm') {
            $report->increment('confirm_count');
        } else {
            $report->increment('dispute_count');
        }

        $this->resolveTierBIfThresholdReached($report->fresh(), $location);

        return response()->json([
            'message' => 'Vote recorded.',
            'vote' => $vote,
            'report' => $report->fresh(),
            'location' => $location->fresh(),
        ], 201);
    }

    public function requestFixReview(Report $report)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['message' => 'Please login first'], 401);
        }

        $location = $report->location;

        if ($location->user_id !== $user->id) {
            return response()->json(['message' => "Only the gem's owner can request a fix review."], 403);
        }

        if (!in_array($report->reason, Report::AMENDABLE_REASONS, true)) {
            return response()->json(['message' => 'This type of report cannot be amended.'], 400);
        }

        $root = $report->parent_report_id ? $report->parent()->firstOrFail() : $report;

        if ($root->status !== 'upheld' || $location->report_status !== 'upheld') {
            return response()->json(['message' => 'This report is not currently awaiting a fix.'], 400);
        }

        $child = Report::create([
            'parent_report_id' => $root->id,
            'user_id' => $user->id,
            'location_id' => $location->id,
            'reason' => $root->reason,
            'flagged_item' => $root->flagged_item,
            'confirm_count' => 0,
        ]);

        // Fresh 30 days from this attempt — restarting the countdown on every
        // amend was an explicit choice, not just on the first one.
        $root->update(['delete_at' => now()->addDays(30)]);

        return response()->json([
            'message' => 'Fix submitted. The community will now vote on whether it resolves the report.',
            'report' => $child,
        ], 201);
    }

    private function reportRateLimitExceeded(int $userId): bool
    {
        return Report::where('user_id', $userId)
            ->where('created_at', '>=', now()->subDay())
            ->count() >= self::MAX_REPORTS_PER_DAY;
    }

    private function isEstablishedAccount($user): bool
    {
        if ($user->created_at && $user->created_at->lte(now()->subDays(self::MIN_ACCOUNT_AGE_DAYS))) {
            return true;
        }

        return CheckIn::where('user_id', $user->id)->exists();
    }

    private function resolveTierBIfThresholdReached(Report $report, Location $location): void
    {
        if ($report->confirm_count >= self::VERIFICATION_THRESHOLD) {
            $this->applyConfirmedTierB($report, $location);
        } elseif ($report->dispute_count >= self::VERIFICATION_THRESHOLD) {
            $this->applyDisputedTierB($report, $location);
        }
    }

    private function applyConfirmedTierB(Report $report, Location $location): void
    {
        if ($report->parent_report_id) {
            $report->update(['status' => 'fix_confirmed', 'resolved_at' => now()]);
            $root = $report->parent()->first();
            $root?->update(['status' => 'resolved', 'resolved_at' => now(), 'delete_at' => null]);
            $location->update(['status' => 'hidden_gem', 'report_status' => null]);

            return;
        }

        $report->update(['status' => 'upheld', 'resolved_at' => now()]);

        if (in_array($report->reason, Report::IMMEDIATE_DELETE_REASONS, true)) {
            $location->update(['status' => 'deleted', 'report_status' => 'upheld']);

            return;
        }

        if ($report->reason === 'incorrect_location') {
            $location->update([
                'latitude' => $report->suggested_latitude,
                'longitude' => $report->suggested_longitude,
                'report_status' => null,
            ]);

            return;
        }

        if (in_array($report->reason, Report::AMENDABLE_REASONS, true)) {
            $location->update(['status' => 'delisted', 'report_status' => 'upheld']);
            $report->update(['delete_at' => now()->addDays(30)]);

            return;
        }
    }

    private function applyDisputedTierB(Report $report, Location $location): void
    {
        $report->update(['status' => 'rejected', 'resolved_at' => now()]);
        if ($report->parent_report_id) {
            return;
        }

        $location->update(['report_status' => null]);
    }

    /** Tier A resolution — an automated check decides, not a human vote. */
    private function resolveTierA(string $reason, Location $location): void
    {
        $pending = Report::where('location_id', $location->id)
            ->where('reason', $reason)
            ->whereNull('resolved_at')
            ->get();

        if ($reason === 'duplicate') {
            $duplicate = (new \App\Services\DuplicateDetectionService())->detect($location);

            if ($duplicate['status'] === 'CONFIRMED_DUPLICATE') {
                $location->update(['status' => 'deleted']);
                $pending->each->update(['status' => 'upheld', 'resolved_at' => now()]);
            } else {
                $pending->each->update(['status' => 'rejected', 'resolved_at' => now()]);
            }

            return;
        }
    }
}
