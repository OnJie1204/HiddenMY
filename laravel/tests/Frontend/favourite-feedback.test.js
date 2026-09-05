import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
    failedFavouriteUpdate,
    FAVOURITE_UPDATE_FAILURE_MESSAGE,
    FAVOURITE_UPDATE_SUCCESS_MESSAGE,
    favouriteKeysFromResponse,
} from "../../resources/js/utils/achievements/favourites.js";

test("a confirmed favourite response supplies ordered state and exact success feedback", () => {
    const response = { data: { data: [
        { key: "gem-hunter", position: 2 },
        { key: "first-footprint", position: 1 },
    ] } };

    assert.deepEqual(favouriteKeysFromResponse(response), ["first-footprint", "gem-hunter"]);
    assert.equal(FAVOURITE_UPDATE_SUCCESS_MESSAGE, "Favourites updated successfully.");
});

test("a failed favourite save restores the last saved state and exact failure feedback", () => {
    const savedKeys = ["first-footprint"];
    const failure = failedFavouriteUpdate(savedKeys);

    assert.deepEqual(failure.keys, savedKeys);
    assert.notEqual(failure.keys, savedKeys);
    assert.equal(failure.message, "Failed to update favourites. Please try again.");
    assert.equal(failure.message, FAVOURITE_UPDATE_FAILURE_MESSAGE);
});

test("maximum-two feedback remains and no reorder UI is introduced", () => {
    const source = readFileSync(
        new URL("../../resources/js/components/achievements/HiddenMYAchievements.jsx", import.meta.url),
        "utf8"
    );

    assert.match(source, /You can select up to 2 favourites\./);
    assert.doesNotMatch(source, /Move Up|Move Down|drag-and-drop|draggable=/i);
});

test("all action feedback uses one existing top-centre snackbar and auto-dismisses", () => {
    const componentSource = readFileSync(
        new URL("../../resources/js/components/achievements/HiddenMYAchievements.jsx", import.meta.url),
        "utf8"
    );
    const cssSource = readFileSync(
        new URL("../../resources/css/base/global.css", import.meta.url),
        "utf8"
    );

    assert.equal((componentSource.match(/hiddenmy-favourite-snackbar/g) || []).length, 1);
    assert.match(componentSource, /hidden-gem-snackbar hiddenmy-favourite-snackbar hidden-gem-snackbar-/);
    assert.match(componentSource, /setTimeout\(\(\) => setFavouriteSaveFeedback\(null\), 3000\)/);
    assert.match(componentSource, /setFavouriteSaveFeedback\(\{[\s\S]*?You can select up to 2 favourites/);
    assert.match(cssSource, /\.hidden-gem-snackbar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*30px;[\s\S]*?left:\s*50%;[\s\S]*?translateX\(-50%\)/);
    assert.match(cssSource, /\.hiddenmy-favourite-snackbar\s*\{[\s\S]*?width: max-content;[\s\S]*?text-align: center;[\s\S]*?white-space: normal;[\s\S]*?text-wrap: balance/);
    assert.match(cssSource, /@media \(max-width: 480px\)[\s\S]*?\.hiddenmy-favourite-snackbar\s*\{[\s\S]*?max-width: calc\(100vw - 24px\)/);
    assert.doesNotMatch(cssSource, /\.hiddenmy-favourite-snackbar\s*\{[^}]*transform:/);
});

test("persistent Favourite loading and retrieval states remain inline", () => {
    const source = readFileSync(
        new URL("../../resources/js/components/achievements/HiddenMYAchievements.jsx", import.meta.url),
        "utf8"
    );

    assert.match(source, /Loading favourites/);
    assert.match(source, /Favourites unavailable/);
    assert.match(source, /favouritesError && \([\s\S]*?hiddenmy-favourites-message/);
});
