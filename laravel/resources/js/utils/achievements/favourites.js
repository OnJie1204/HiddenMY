export const FAVOURITE_UPDATE_SUCCESS_MESSAGE = "Favourites updated successfully.";
export const FAVOURITE_UPDATE_FAILURE_MESSAGE = "Failed to update favourites. Please try again.";

export function favouriteKeysFromResponse(response) {
    return [...(response?.data?.data || [])]
        .sort((first, second) => first.position - second.position)
        .map((favourite) => favourite.key);
}

export function failedFavouriteUpdate(savedKeys) {
    return {
        keys: [...savedKeys],
        message: FAVOURITE_UPDATE_FAILURE_MESSAGE,
    };
}
