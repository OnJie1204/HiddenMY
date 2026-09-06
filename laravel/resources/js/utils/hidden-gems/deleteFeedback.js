export const DELETE_SUCCESS_MESSAGE = "Hidden gem deleted successfully.";
export const DELETE_FAILURE_MESSAGE = "Failed to delete hidden gem.";

export function deleteFailureMessage(error) {
    return error?.response?.data?.message || DELETE_FAILURE_MESSAGE;
}

export function removeDeletedGem(gems, deletedId) {
    return gems.filter((gem) => gem.id !== deletedId);
}
