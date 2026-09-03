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
    permanently_closed: {
        status: "permanently_closed",
        label: "Permanently closed",
        badgeClass: "hidden-gems-card-reported",
        message: "The community confirmed this place has closed for good. It stays listed for reference.",
    },
    // Legacy — no gem is delisted any more (the delist/repair flow was
    // replaced by the permanently_closed / contact-edit flags). Kept only in
    // case an old row surfaces.
    delisted: {
        status: "delisted",
        label: "Delisted",
        badgeClass: "hidden-gems-card-reported",
        message: "This place was removed after the community confirmed a reported problem.",
    },
};

export function getGemStatusDisplay(gem) {
    // A permanently-closed gem keeps status 'hidden_gem' — the flag decides.
    if (gem?.permanently_closed_at || gem?.permanentlyClosedAt) {
        return GEM_STATUS_COPY.permanently_closed;
    }
    return GEM_STATUS_COPY[gem?.status] ?? GEM_STATUS_COPY.pending;
}

export function voteProgressLabel(gem) {
    const count = gem?.vote_count || 0;
    const threshold = gem?.verification_threshold || 10;
    return `${count} of ${threshold} votes`;
}
