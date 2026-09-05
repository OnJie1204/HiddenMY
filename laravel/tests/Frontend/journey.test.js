import test from "node:test";
import assert from "node:assert/strict";

import {
    isCurrentVerifiedContribution,
    isJourneyMarkerEligible,
    isLifetimeVerifiedContribution,
    journeyMarkerPresentation,
    matchesMyHiddenGemFilters,
} from "../../resources/js/utils/achievements/journey.js";

test("Journey marker eligibility follows the internal status matrix", () => {
    assert.equal(isJourneyMarkerEligible("pending"), false);
    assert.equal(isJourneyMarkerEligible("ai_rejected"), false);
    assert.equal(isJourneyMarkerEligible("pending_community_vote"), true);
    assert.equal(isJourneyMarkerEligible("hidden_gem"), true);
    assert.equal(isJourneyMarkerEligible("well_known"), true);
    assert.equal(isJourneyMarkerEligible("archived"), true);
    assert.equal(isJourneyMarkerEligible("deleted"), false);
});

test("current and lifetime verified definitions remain distinct", () => {
    assert.equal(isCurrentVerifiedContribution("hidden_gem"), true);
    assert.equal(isCurrentVerifiedContribution("well_known"), true);
    assert.equal(isCurrentVerifiedContribution("archived"), false);
    assert.equal(isLifetimeVerifiedContribution("archived"), true);
    assert.equal(isLifetimeVerifiedContribution("pending_community_vote"), false);
});

test("closed and archived presentation takes priority over status", () => {
    assert.deepEqual(
        journeyMarkerPresentation({ status: "well_known", permanently_closed_at: "2026-09-05" }),
        { label: "Permanently Closed", tone: "closed", closed: true }
    );
    assert.deepEqual(
        journeyMarkerPresentation({ status: "archived" }),
        { label: "Past Discovery", tone: "archived", closed: true }
    );
});

test("Well-Known Place works with the existing AND filter behavior", () => {
    const gem = { status: "well_known", category_id: 7, state: "Penang" };
    assert.equal(matchesMyHiddenGemFilters(gem, {
        status: "well_known",
        category: "7",
        state: "Penang",
    }), true);
    assert.equal(matchesMyHiddenGemFilters(gem, {
        status: "well_known",
        category: "8",
        state: "Penang",
    }), false);
});
