import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
    contributionTargetPath,
    isContributionTargetAvailable,
    UNAVAILABLE_LOCATION_MESSAGE,
} from "../../resources/js/utils/hidden-gems/contributionHistory.js";

test("deleted and archived contribution targets are unavailable and cannot navigate", () => {
    for (const status of ["deleted", "archived"]) {
        const contribution = {
            location_available: false,
            location: null,
            historical_status: status,
        };

        assert.equal(isContributionTargetAvailable(contribution), false);
        assert.equal(contributionTargetPath(contribution), null);
    }
    assert.equal(UNAVAILABLE_LOCATION_MESSAGE, "This Hidden Gem is no longer available.");
});

test("available contribution targets retain normal detail navigation", () => {
    const contribution = {
        location_available: true,
        location: { id: 42 },
    };

    assert.equal(isContributionTargetAvailable(contribution), true);
    assert.equal(contributionTargetPath(contribution), "/hidden-gems/42");
});

test("My Contributions does not introduce keyboard or alternate unavailable navigation", () => {
    const source = readFileSync(
        new URL("../../resources/js/pages/hidden-gems/MyHiddenGems.jsx", import.meta.url),
        "utf8"
    );

    assert.match(source, /onClick=\{locationAvailable \?/);
    assert.doesNotMatch(source, /onKeyDown=/);
    assert.doesNotMatch(source, /View Details/);
});
