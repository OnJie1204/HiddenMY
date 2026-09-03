<?php

namespace App\Http\Controllers;

use App\Models\CheckIn;
use App\Models\Location;
use App\Models\Report;
use App\Models\ReportVote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;

/**
 * Reporting — Hidden Gems (verified, or still in community voting).
 *
 * Two reasons, each resolved by a community vote (5 confirms upholds, 5
 * disputes rejects); until then the gem carries report_status = 'under_review'.
 *
 *   permanently_closed     — the place has shut for good. Needs a check-in.
 *                            Upheld -> locations.permanently_closed_at is set;
 *                            the gem stays visible but greyed out and frozen.
 *
 *   inappropriate_content  — something published is wrong; the reporter
 *                            attaches the correction.
 *       * verified gem: contact info only (hours / phone / website). Upheld
 *         -> contact_edit_unlocked_at; owner gets a contact-fields-only edit
 *         that keeps verification.
 *       * gem in community voting: location (needs a check-in), description
 *         and/or contact info. Upheld -> contact_edit_unlocked_at; owner's
 *         fix counts as a full resubmit (HiddenGemController::update resets to
 *         pending and re-runs AI review + a fresh community vote).
 *
 * Nothing here ever deletes or hides a gem.
 */
class ReportController extends Controller
{
    /** Confirms (or disputes) needed to resolve a report. */
    private const VERIFICATION_THRESHOLD = 5;

    private const MAX_REPORTS_PER_DAY = 5;
    private const MIN_ACCOUNT_AGE_DAYS = 7;

    /**
     * Which gem statuses each reason can be filed against — both reasons apply
     * to a verified gem and to one still in community voting.
     *
     * inappropriate_content scope differs by status:
     * - hidden_gem: contact info only (hours / phone / website). A confirmed
     *   report unlocks a contact-fields-only edit, keeping verification.
     * - pending_community_vote: location, description and/or contact info, any
     *   combination. A location correction needs the reporter to have checked
     *   in (within 5 km). A confirmed report lets the owner fix it — which
     *   counts as a full resubmission (back through AI review + a fresh vote).
     */
    private const REPORTABLE_STATUSES = [
        'permanently_closed' => ['hidden_gem', 'pending_community_vote'],
        'inappropriate_content' => ['hidden_gem', 'pending_community_vote'],
    ];

    /** Union of every status any reason can be filed against. */
    private function anyReportableStatuses(): array
    {
        return array_values(array_unique(array_merge(...array_values(self::REPORTABLE_STATUSES))));
    }

    private function reasonsForStatus(string $status): array
    {
        return array_values(array_filter(
            Report::REASONS,
            fn (string $reason) => in_array($status, self::REPORTABLE_STATUSES[$reason] ?? [], true),
        ));
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

        if (!in_array($location->status, $this->anyReportableStatuses(), true)) {
            return response()->json([
                'eligible' => false,
                'message' => 'Only Hidden Gems that have passed AI review can be reported.',
            ]);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json([
                'eligible' => false,
                'message' => 'This gem is already marked permanently closed.',
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
            'reasons' => $this->reasonsForStatus($location->status),
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
            // inappropriate_content: the reporter's corrections. Each optional
            // individually — someone might only know the new phone number.
            'suggested_opening_hours' => 'nullable|string|max:255',
            'suggested_phone' => 'nullable|string|max:30',
            'suggested_website' => 'nullable|url|max:255',
            // pending_community_vote gems only (enforced below):
            'suggested_description' => 'nullable|string|max:2000',
            'suggested_latitude' => 'nullable|numeric|between:-90,90|required_with:suggested_longitude',
            'suggested_longitude' => 'nullable|numeric|between:-180,180|required_with:suggested_latitude',
        ]);

        $reason = $validated['reason'];
        $isVotingGem = $location->status === 'pending_community_vote';

        if ($location->user_id === $user->id) {
            return response()->json(['message' => 'You cannot report your own hidden gem'], 403);
        }

        if (!in_array($location->status, self::REPORTABLE_STATUSES[$reason] ?? [], true)) {
            return response()->json([
                'message' => 'Only Hidden Gems that have passed AI review can be reported.',
            ], 400);
        }

        if ($location->permanently_closed_at !== null) {
            return response()->json(['message' => 'This gem is already marked permanently closed.'], 400);
        }

        if ($location->report_status === 'under_review') {
            return response()->json(['message' => 'This gem already has a report under review.'], 400);
        }

        if ($this->reportRateLimitExceeded($user->id)) {
            return response()->json(['message' => 'You have reached the daily limit for reports. Please try again tomorrow.'], 429);
        }

        // Which corrections the reporter is allowed to attach, by gem status.
        $wantsLocation = $isVotingGem && isset($validated['suggested_latitude']);
        $wantsDescription = $isVotingGem && !empty($validated['suggested_description']);
        $wantsContact = ($validated['suggested_opening_hours'] ?? null) !== null
            || ($validated['suggested_phone'] ?? null) !== null
            || ($validated['suggested_website'] ?? null) !== null;

        if ($reason === 'inappropriate_content') {
            if (!$isVotingGem && (isset($validated['suggested_latitude']) || !empty($validated['suggested_description']))) {
                return response()->json([
                    'message' => 'A verified Hidden Gem can only be reported for incorrect contact info.',
                ], 400);
            }

            if (!$wantsLocation && !$wantsDescription && !$wantsContact) {
                return response()->json([
                    'message' => $isVotingGem
                        ? 'Add at least one correction — location, description or contact info.'
                        : 'Add at least one corrected contact detail.',
                ], 400);
            }
        }

        // permanently_closed always needs a check-in; an inappropriate_content
        // report needs one only when it proposes a corrected location.
        $requiresCheckIn = in_array($reason, Report::LOCATION_REQUIRED_REASONS, true) || $wantsLocation;

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

        $isContentReport = $reason === 'inappropriate_content';

        $report = Report::create([
            'user_id' => $user->id,
            'location_id' => $locationId,
            'reason' => $reason,
            'description' => $validated['description'] ?? null,
            'photo_path' => $photoPath,
            'suggested_opening_hours' => $isContentReport && $wantsContact ? ($validated['suggested_opening_hours'] ?? null) : null,
            'suggested_phone' => $isContentReport && $wantsContact ? ($validated['suggested_phone'] ?? null) : null,
            'suggested_website' => $isContentReport && $wantsContact ? ($validated['suggested_website'] ?? null) : null,
            'suggested_description' => $isContentReport && $wantsDescription ? $validated['suggested_description'] : null,
            'suggested_latitude' => $isContentReport && $wantsLocation ? $validated['suggested_latitude'] : null,
            'suggested_longitude' => $isContentReport && $wantsLocation ? $validated['suggested_longitude'] : null,
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
        $report = Report::with('user:id,name')
            ->where('location_id', $locationId)
            ->latest()
            ->first();

        if (!$report) {
            return response()->json(['data' => null]);
        }

        $myVerdict = Auth::check()
            ? ReportVote::where('report_id', $report->id)->where('user_id', Auth::id())->value('verdict')
            : null;

        return response()->json([
            'data' => $report,
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

    private function isEstablishedAccount($user): bool
    {
        if ($user->created_at && $user->created_at->lte(now()->subDays(self::MIN_ACCOUNT_AGE_DAYS))) {
            return true;
        }

        return CheckIn::where('user_id', $user->id)->exists();
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
        $report->update(['status' => 'upheld', 'resolved_at' => now()]);

        if ($report->reason === 'permanently_closed') {
            // The gem keeps its status (verified, or still in community
            // voting) and stays publicly visible — the UI greys it out and
            // shows a "Permanently closed" badge. All interactions freeze,
            // including community votes on a gem that was still in voting
            // (Location::acceptsNewInteractions). A verified closed gem is
            // fully frozen; one still in voting can be resubmitted or deleted
            // by its owner (HiddenGemController::managementEligibility).
            $location->update([
                'report_status' => null,
                'permanently_closed_at' => now(),
            ]);

            return;
        }

        if ($report->reason === 'inappropriate_content') {
            // Unlock the owner to fix the flagged fields. For a verified gem
            // that's a contact-fields-only edit (verification preserved); for
            // a gem still in voting it re-enables a full edit even though
            // votes exist, and that edit resubmits it (see
            // HiddenGemController::managementEligibility + update). The
            // reporter's corrections ride along on the report for the owner
            // and the detail page to display.
            $location->update([
                'report_status' => null,
                'contact_edit_unlocked_at' => now(),
            ]);

            return;
        }
    }

    private function applyDisputed(Report $report, Location $location): void
    {
        $report->update(['status' => 'rejected', 'resolved_at' => now()]);
        $location->update(['report_status' => null]);
    }
}
