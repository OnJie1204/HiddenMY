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

    /** Same set WishlistController allows saving — anything a user can
     *  wishlist/compare, they can also flag a problem with. */
    private const REPORTABLE_STATUSES = ['hidden_gem', 'pending_community_vote'];

    public function checkEligibility($locationId)
    {
        $user = Auth::user();

        if (!$user) {
            return response()->json(['eligible' => false, 'message' => 'Please login first'], 401);
        }

        $location = Location::findOrFail($locationId);

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

        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $locationId)
            ->exists();

        return response()->json([
            'eligible' => true,
            'has_check_in' => $hasCheckIn,
            'message' => $hasCheckIn ? 'You can report this gem.' : 'Please check-in at this location first',
            'location' => $location,
            'reasons' => Report::REASONS,
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

        if ($location->user_id === $user->id) {
            return response()->json(['message' => 'You cannot report your own hidden gem'], 403);
        }

        if (!in_array($location->status, self::REPORTABLE_STATUSES, true)) {
            return response()->json(['message' => 'Only gems that have passed AI review can be reported.'], 400);
        }

        if ($location->report_status === 'under_review') {
            return response()->json(['message' => 'This gem already has a report under review.'], 400);
        }

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
            'reason' => $validated['reason'],
            'description' => $validated['description'] ?? null,
            'photo_path' => $photoPath,
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

        $location = $report->location;

        if ($location->user_id === $user->id) {
            return response()->json(['eligible' => false, 'message' => 'You cannot verify a report on your own hidden gem.']);
        }

        $alreadyVoted = ReportVote::where('report_id', $report->id)->where('user_id', $user->id)->exists();

        if ($alreadyVoted) {
            return response()->json(['eligible' => false, 'message' => 'You have already voted on this report.']);
        }

        $hasCheckIn = CheckIn::where('user_id', $user->id)
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

        $hasCheckIn = CheckIn::where('user_id', $user->id)
            ->where('location_id', $location->id)
            ->exists();

        if (!$hasCheckIn) {
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

    /* Resolves the report. */
    private function resolveIfThresholdReached(Report $report, Location $location): void
    {
        if ($report->confirm_count >= self::VERIFICATION_THRESHOLD) {
            $report->update(['status' => 'upheld', 'resolved_at' => now()]);
            $location->update(['status' => 'delisted', 'report_status' => 'upheld']);
        } elseif ($report->dispute_count >= self::VERIFICATION_THRESHOLD) {
            $report->update(['status' => 'rejected', 'resolved_at' => now()]);
            $location->update(['report_status' => null]);
        }
    }
}
