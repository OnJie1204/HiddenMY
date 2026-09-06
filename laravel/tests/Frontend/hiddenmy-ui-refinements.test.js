import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detailSource = readFileSync(
    new URL("../../resources/js/pages/hidden-gems/HiddenGemDetail.jsx", import.meta.url),
    "utf8",
);
const managementSource = readFileSync(
    new URL("../../resources/js/pages/hidden-gems/MyHiddenGems.jsx", import.meta.url),
    "utf8",
);
const mainGemsSource = readFileSync(
    new URL("../../resources/js/pages/hidden-gems/HiddenGems.jsx", import.meta.url),
    "utf8",
);
const homeSource = readFileSync(
    new URL("../../resources/js/pages/home/Home.jsx", import.meta.url),
    "utf8",
);
const mapsSource = readFileSync(
    new URL("../../resources/js/pages/hidden-gems/Maps.jsx", import.meta.url),
    "utf8",
);
const achievementsSource = readFileSync(
    new URL("../../resources/js/components/achievements/HiddenMYAchievements.jsx", import.meta.url),
    "utf8",
);

test("Report details have no redundant line break and the guest warning reuses the Report icon", () => {
    assert.doesNotMatch(detailSource, /<strong>Report details<\/strong><br \/>/);
    const guestWarning = detailSource.match(/!currentUser && gem\.has_active_report[\s\S]*?<\/div>\n\s*\)\}/)?.[0] ?? "";
    assert.match(guestWarning, /authenticated-report-icon/);
    assert.match(guestWarning, /aria-hidden="true">⚠<\/span>/);
    assert.match(guestWarning, /Information for this Hidden Gem is under community review\./);
});

test("missing Location keeps its error state without a redundant Back to List link", () => {
    const missingState = detailSource.match(/if \(error \|\| !gem\)[\s\S]*?\n    \}/)?.[0] ?? "";
    assert.match(missingState, /gem-detail-error/);
    assert.doesNotMatch(missingState, /Back to List/);
});

test("My Hidden Gems community-vote badge follows the main Hidden Gems presentation", () => {
    assert.match(mainGemsSource, /className="hidden-gems-card-pending"[\s\S]*?Pending \(/);
    assert.match(managementSource, /className="hidden-gems-card-pending"[\s\S]*?Pending \(/);
    assert.match(managementSource, /gem\.votes_count \?\? gem\.vote_count \?\? 0/);
    assert.match(managementSource, /gem\.verification_threshold \|\| 10/);
});

test("My Hidden Gems status filter uses scoped traveller wording without changing values", () => {
    assert.match(managementSource, /<option value="pending">Under Verification<\/option>/);
    assert.match(managementSource, /<option value="ai_rejected">Not Accepted<\/option>/);
    assert.match(managementSource, /<option value="pending_community_vote">Under Community Review<\/option>/);
    assert.match(managementSource, /<option value="hidden_gem">Hidden Gem<\/option>/);
    assert.match(managementSource, /<option value="well_known">Well-Known Place<\/option>/);
});

test("only the named Home and Map discovery collections filter permanently closed Locations", () => {
    assert.match(homeSource, /setPopularGems\([\s\S]*?!gem\.permanently_closed_at && !gem\.permanentlyClosedAt[\s\S]*?\.slice\(0, 10\)/);
    assert.equal((mapsSource.match(/!gem\.permanently_closed_at && !gem\.permanentlyClosedAt/g) || []).length, 3);
    assert.match(mapsSource, /setRecentPosts\(/);
    assert.match(mapsSource, /setMyGems\(/);
    assert.match(mapsSource, /setPopularPosts\(/);
});

test("Achievement collections sort earned entries first without changing favourite positions", () => {
    assert.match(achievementsSource, /const orderedRegions = useMemo/);
    assert.match(achievementsSource, /orderedRegions\.map/);
    assert.match(achievementsSource, /Number\(second\.available && second\.unlocked\)/);
    assert.match(achievementsSource, /\.sort\(\(first, second\) => first\.position - second\.position\)/);
});
