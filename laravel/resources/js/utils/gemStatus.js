// Shared display copy for a Location's two-stage verification status:
// Stage 1 (AI hiddenness check) -> pending | ai_rejected | pending_community_vote
// Stage 2 (community voting)    -> pending_community_vote -> hidden_gem
export const GEM_STATUS_COPY = {
    pending: {
        status: "pending",
        label: "Being Verified",
        badgeClass: "hidden-gems-card-pending",
        message: "Your submission is currently being verified by AI.",
    },
    ai_rejected: {
        status: "ai_rejected",
        label: "Not Accepted",
        badgeClass: "hidden-gems-card-rejected",
        message: "Your submission did not meet HiddenMY's hidden gem requirements.",
    },
    pending_community_vote: {
        status: "pending_community_vote",
        label: "Awaiting Community Votes",
        badgeClass: "hidden-gems-card-voting",
        message: "AI has approved this place as a potential hidden gem — it now needs community votes to be recognized as a Hidden Gem.",
    },
    hidden_gem: {
        status: "hidden_gem",
        label: "Hidden Gem",
        badgeClass: "hidden-gems-card-verified",
        message: "This place has been recognized as a HiddenMY Hidden Gem!",
    },
};

const REPORTED_BADGE = {
    status: "under_review",
    label: "Reported",
    badgeClass: "hidden-gems-card-reported",
    message: "This gem has an active report — the community is voting to confirm or dispute it.",
};

export function getGemStatusDisplay(gem) {
    if ((gem?.reportStatus ?? gem?.report_status) === "under_review") {
        return REPORTED_BADGE;
    }
    return GEM_STATUS_COPY[gem?.status] ?? GEM_STATUS_COPY.pending;
}

export function voteProgressLabel(gem) {
    const count = gem?.vote_count || 0;
    const threshold = gem?.verification_threshold || 10;
    return `${count} of ${threshold} votes`;
}
