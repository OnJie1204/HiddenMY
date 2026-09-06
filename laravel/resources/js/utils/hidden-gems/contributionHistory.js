export const UNAVAILABLE_LOCATION_MESSAGE = "This Hidden Gem is no longer available.";

export function isContributionTargetAvailable(contribution) {
    return contribution?.location_available !== false
        && Boolean(contribution?.location?.id);
}

export function contributionTargetPath(contribution) {
    return isContributionTargetAvailable(contribution)
        ? `/hidden-gems/${contribution.location.id}`
        : null;
}
