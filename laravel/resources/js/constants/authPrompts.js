const AUTH_PROMPTS = Object.freeze({
    wishlist: {
        message: "Login to save this gem to your wishlist.",
        action: "wishlist",
    },
    itinerary: {
        message: "Login to add this gem to a trip itinerary.",
        action: "itinerary",
    },
    report: {
        message: "Login to report a problem with this gem.",
        action: "report",
    },
    verifyReport: {
        message: "Login to help verify this report.",
        action: "verify",
    },
    vote: {
        message: "Login to vote on this hidden gem.",
        action: "vote",
    },
    comment: {
        message: "Login to rate or comment on this hidden gem.",
        action: "comment",
    },
    suggestMenuItem: {
        message: "Login to suggest a menu item.",
    },
    likeMenuItem: {
        message: "Login to like a menu item.",
    },
    viewProfile: {
        message: "Login to view this traveler's profile.",
    },
    submitHiddenGem: {
        message: "Login to submit a hidden gem.",
    },
    writeTravelPost: {
        message: "Login to write a travel post.",
    },
    viewMyTravelPosts: {
        message: "Login to see the posts you've written.",
    },
    viewTrips: {
        message: "Login to view your trips.",
    },
    createTrip: {
        message: "Login to create a trip itinerary.",
    },
    copyTrip: {
        message: "Login to copy this trip into your itineraries.",
    },
    manageHiddenGems: {
        message: "Login to manage your hidden gems and contributions.",
    },
    planTrips: {
        message: "Login to view and plan your trips.",
    },
});

export function getAuthPrompt(reason) {
    return AUTH_PROMPTS[reason] ?? null;
}

export default AUTH_PROMPTS;
