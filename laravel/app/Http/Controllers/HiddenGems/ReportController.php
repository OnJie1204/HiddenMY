<?php

namespace App\Http\Controllers\HiddenGems;

use App\Http\Controllers\Controller;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\Report;
use App\Models\ReportVote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

/**
 * Reporting — verified places (pending_community_vote / hidden_gem / well_known).
 *
 * Two reasons, each resolved by its own community vote (5 confirms upholds, 5
 * disputes rejects). One report per reason may be open on a place at a time,
 * and the two reasons can be open simultaneously.
 *
 *   permanently_closed      — the place has shut for good. The reporter (and
 *                             every verifier) must have checked in there.
 *                             Upheld -> locations.permanently_closed_at is set;
 *                             the place stays visible but is greyed out and
 *                             frozen everywhere, and its owner can only delete it.
 *
 *   incorrect_contact_info  — the opening hours / phone / website are wrong.
 *                             Also needs a check-in (you have to have been
 *                             there). Upheld -> a warning flag
 *                             (locations.contact_flagged_at) that shows a ⚠
 *                             icon next to the contact block and clears itself
 *                             on the owner's next contact edit. No freeze.
 *
 * Nothing here ever deletes, hides or re-verifies a place.
 */
class ReportController extends Controller
{
    /** Confirms (or disputes) needed to resolve a report. */
    private const VERIFICATION_THRESHOLD = 5;

    private const MAX_REPORTS_PER_DAY = 5;

    /** Every status a report of either reason can be filed against. */
    private function reportableStatuses(): array
    {
        return Location::PUBLICLY_VISIBLE_STATUSES;
    }

    /** Reasons still open (no pending report) for this place. */
    private function availableReasons(Location $location): array
    {
        $openReasons = $location->reports()
            ->where('status', Report::STATUS_PENDING)
            ->pluck('reason')
            ->all();

        return array_values(array_diff(Report::REASONS, $openReasons));
    }

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

        if (!in_array($location->status, $this->reportableStatuses(), true)) {
            return response()->json([
                'eligible' => false,
                'message' => 'Only verified places can be reported.',
            ]);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json([
                'eligible' => false,
                'message' => 'This place is already marked permanently closed.',
            ]);
        }

        $availableReasons = $this->availableReasons($location);

        if (empty($availableReasons)) {
            return response()->json([
                'eligible' => false,
                'message' => 'Every report reason already has a report under review for this place.',
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
            'message' => $hasCheckIn ? 'You can report this place.' : 'Please check-in at this location first',
            'location' => $location,
            'reasons' => $availableReasons,
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
        ]);

        $reason = $validated['reason'];

        if ($location->user_id === $user->id) {
            return response()->json(['message' => 'You cannot report your own hidden gem'], 403);
        }

        if (!in_array($location->status, $this->reportableStatuses(), true)) {
            return response()->json([
                'message' => 'Only verified places can be reported.',
            ], 400);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json(['message' => 'This place is already marked permanently closed.'], 400);
        }

        if (!in_array($reason, $this->availableReasons($location), true)) {
            return response()->json([
                'message' => 'There is already a report under review for that reason.',
            ], 400);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json(['message' => 'You have reached the daily limit for reports. Please try again tomorrow.'], 429);
        }

        // Both reasons need a check-in at the place — you have to have actually
        // been there to know it has closed or that its contact details are wrong.
        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        if (!$hasCheckIn) {
            return response()->json(['message' => 'Please check-in at this location first before reporting'], 400);
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
            'status' => Report::STATUS_PENDING,
            'confirm_count' => 0,
            'dispute_count' => 0,
        ]);

        $location->update(['report_status' => 'under_review']);

        return response()->json([
            'message' => 'Report submitted. The community will now vote to confirm or dispute it.',
            'report' => $report,
            'location' => $location->fresh(),
        ], 201);
    }

    public function show($locationId)
    {
        $reports = Report::with('user:id,name')
            ->where('location_id', $locationId)
            ->whereIn('status', [Report::STATUS_PENDING, Report::STATUS_UPHELD])
            ->latest()
            ->get();

        $pending = $reports->firstWhere('status', Report::STATUS_PENDING);

        $myVerdict = ($pending && Auth::check())
            ? ReportVote::where('report_id', $pending->id)->where('user_id', Auth::id())->value('verdict')
            : null;

        return response()->json([
            'data' => $pending,
            'root_report' => $pending,
            'reports' => $reports,
            'my_verdict' => $myVerdict,
        ]);
    }

    /** Same shape as checkEligibility() above, for the confirm/dispute vote. */
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

        $requiresCheckIn = $report->requiresCheckIn();
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

        $requiresCheckIn = $report->requiresCheckIn();
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

        $this->resolveIfThresholdReached($report->fresh(), $location);

        return response()->json([
            'message' => 'Vote recorded.',
            'vote' => $vote,
            'report' => $report->fresh(),
            'location' => $location->fresh(),
        ], 201);
    }

    private function reportRateLimitExceeded(int $userId): bool
    {
        return Report::where('user_id', $userId)
            ->where('created_at', '>=', now()->subDay())
            ->count() >= self::MAX_REPORTS_PER_DAY;
    }


    private function resolveIfThresholdReached(Report $report, Location $location): void
    {
        if ($report->confirm_count >= self::VERIFICATION_THRESHOLD) {
            $this->applyConfirmed($report, $location);
        } elseif ($report->dispute_count >= self::VERIFICATION_THRESHOLD) {
            $this->applyDisputed($report, $location);
        }
    }

    private function applyConfirmed(Report $report, Location $location): void
    {
        $report->update(['status' => Report::STATUS_UPHELD, 'resolved_at' => now()]);

        if ($report->reason === Report::REASON_PERMANENTLY_CLOSED) {
            // The place keeps its status and stays publicly visible — the UI
            // greys it out and shows a "Permanently closed" badge. Every
            // interaction freezes (Location::acceptsNewInteractions) and the
            // owner can now only delete it.
            $location->update(['permanently_closed_at' => now()]);
        }

        if ($report->reason === Report::REASON_INCORRECT_CONTACT) {
            // A warning flag next to the contact block. It clears itself the
            // next time the owner edits their contact fields
            // (HiddenGemController::update, 'contact' edit type).
            $location->update(['contact_flagged_at' => now()]);
        }

        $this->clearReportStatusIfSettled($location);
    }

    private function applyDisputed(Report $report, Location $location): void
    {
        $report->update(['status' => Report::STATUS_REJECTED, 'resolved_at' => now()]);
        $this->clearReportStatusIfSettled($location);
    }

    /** report_status is a coarse "has an open report" marker — drop it once none remain. */
    private function clearReportStatusIfSettled(Location $location): void
    {
        $stillOpen = $location->reports()
            ->where('status', Report::STATUS_PENDING)
            ->exists();

        if (!$stillOpen) {
            $location->update(['report_status' => null]);
        }
    }
}
