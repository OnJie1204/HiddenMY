export const JOURNEY_STATUS_LABELS = {
    pending_community_vote: "Awaiting Community Votes",
    hidden_gem: "Hidden Gem",
    well_known: "Well-Known Place",
    archived: "Past Discovery",
};

export const isJourneyMarkerEligible = (status) =>
    Object.hasOwn(JOURNEY_STATUS_LABELS, status);

export const isCurrentVerifiedContribution = (status) =>
    status === "hidden_gem" || status === "well_known";

export const isLifetimeVerifiedContribution = (status) =>
    isCurrentVerifiedContribution(status) || status === "archived";

export const journeyMarkerPresentation = (gem) => {
    if (gem.status === "archived") {
        return { label: "Past Discovery", tone: "archived", closed: true };
    }

    if (gem.permanently_closed_at) {
        return { label: "Permanently Closed", tone: "closed", closed: true };
    }

    return {
        label: JOURNEY_STATUS_LABELS[gem.status],
        tone: gem.status,
        closed: false,
    };
};

export const matchesMyHiddenGemFilters = (gem, filters) =>
    (!filters.status || gem.status === filters.status)
    && (!filters.category || String(gem.category_id) === filters.category)
    && (!filters.state || gem.state === filters.state);
