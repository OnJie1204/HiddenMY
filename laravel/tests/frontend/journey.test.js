import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

import {
    isCurrentVerifiedContribution,
    isJourneyMarkerEligible,
    isLifetimeVerifiedContribution,
    journeyMarkerPresentation,
    matchesMyHiddenGemFilters,
} from "../../resources/js/utils/achievements/journey.js";

const journeyMapSource = readFileSync(
    resolve(process.cwd(), "resources/js/components/achievements/HiddenGemJourneyMap.jsx"),
    "utf8",
);
const clusterIconSource = readFileSync(
    resolve(process.cwd(), "resources/js/components/hidden-gems/GemClusterIcon.jsx"),
    "utf8",
);
const packageSource = readFileSync(
    resolve(process.cwd(), "package.json"),
    "utf8",
);

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

test("Journey preserves its Malaysia initial view without a persistent movement lock", () => {
    assert.match(journeyMapSource, /\[0\.853821, 99\.6404969\]/);
    assert.match(journeyMapSource, /\[7\.3628175, 119\.2690567\]/);
    assert.match(journeyMapSource, /<InitialJourneyView \/>/);
    assert.match(journeyMapSource, /map\.fitBounds\(MALAYSIA_BOUNDS, \{ padding: \[4, 4\], animate: false \}\)/);
    assert.match(journeyMapSource, /map\.setZoom\(map\.getZoom\(\) \+ 0\.1, \{ animate: false \}\)/);
    assert.match(journeyMapSource, /zoomSnap=\{0\.25\}/);
    assert.doesNotMatch(journeyMapSource, /maxBounds=/);
    assert.doesNotMatch(journeyMapSource, /maxBoundsViscosity=/);
    assert.doesNotMatch(journeyMapSource, /setMaxBounds/);
    assert.match(journeyMapSource, /<Popup[\s\S]*?autoPan[\s\S]*?autoPanPadding=\{\[24, 24\]\}/);
});

test("Journey clusters only its existing Gem markers with the shared project behaviour", () => {
    assert.match(journeyMapSource, /import MarkerClusterGroup from "react-leaflet-cluster"/);
    assert.match(journeyMapSource, /import \{ createGemClusterIcon \} from "@\/components\/hidden-gems\/GemClusterIcon"/);
    const cluster = journeyMapSource.match(/<MarkerClusterGroup[\s\S]*?<\/MarkerClusterGroup>/)?.[0] ?? "";
    assert.match(cluster, /iconCreateFunction=\{createGemClusterIcon\}/);
    assert.match(cluster, /zoomToBoundsOnClick=\{true\}/);
    assert.match(cluster, /spiderfyOnMaxZoom=\{true\}/);
    assert.match(cluster, /showCoverageOnHover=\{false\}/);
    assert.match(cluster, /mapMarkers\.map/);
    assert.match(cluster, /key=\{gem\.id\}/);
    assert.match(cluster, /getHiddenGemMarkerIcon\(gem\.status, presentation\.closed\)/);
    assert.match(cluster, /gem\.status === "archived"/);
    assert.match(cluster, /View Details/);
    assert.doesNotMatch(cluster, /<GeoJSON/);
    assert.match(clusterIconSource, /cluster\.getChildCount\(\)/);
    assert.match(clusterIconSource, /<span>\$\{count\}<\/span>/);
    assert.match(packageSource, /"react-leaflet-cluster": "\^4\.1\.3"/);
    assert.match(packageSource, /"leaflet\.markercluster": "\^1\.5\.3"/);
});
