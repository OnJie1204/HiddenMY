import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
    DELETE_FAILURE_MESSAGE,
    DELETE_SUCCESS_MESSAGE,
    deleteFailureMessage,
    removeDeletedGem,
} from "../../resources/js/utils/hidden-gems/deleteFeedback.js";

test("successful deletion removes only the deleted card and uses success feedback", () => {
    const gems = [{ id: 1 }, { id: 2 }];

    assert.deepEqual(removeDeletedGem(gems, 1), [{ id: 2 }]);
    assert.deepEqual(gems, [{ id: 1 }, { id: 2 }]);
    assert.equal(DELETE_SUCCESS_MESSAGE, "Hidden gem deleted successfully.");
});

test("backend deletion errors take priority and do not alter displayed cards", () => {
    const gems = [{ id: 1 }];
    const error = { response: { data: { message: "Deletion is not allowed." } } };

    assert.equal(deleteFailureMessage(error), "Deletion is not allowed.");
    assert.deepEqual(gems, [{ id: 1 }]);
});

test("missing backend deletion message uses the exact fallback", () => {
    assert.equal(deleteFailureMessage({}), "Failed to delete hidden gem.");
    assert.equal(deleteFailureMessage({}), DELETE_FAILURE_MESSAGE);
});

test("My Hidden Gems renders one typed delete snackbar", () => {
    const source = readFileSync(
        new URL("../../resources/js/pages/hidden-gems/MyHiddenGems.jsx", import.meta.url),
        "utf8"
    );

    assert.equal((source.match(/deleteFeedback\.message/g) || []).length, 1);
    assert.match(source, /hidden-gem-snackbar hidden-gem-snackbar-\$\{deleteFeedback\.type\}/);
    assert.match(source, /type: "success", message: DELETE_SUCCESS_MESSAGE/);
    assert.match(source, /type: "error", message: deleteFailureMessage\(error\)/);
});
