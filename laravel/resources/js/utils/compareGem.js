export const MAX_COMPARE = 5;

export function toCompareGem(raw) {
    if (raw.source) return raw;

    return {
        id: raw.id,
        source: "database",
        title: raw.place_name,
        state: raw.state,
        address: raw.address,
        description: raw.description,
        latitude: raw.latitude,
        longitude: raw.longitude,
        image: raw.images?.[0]?.image_url || null,
        voteCount: raw.vote_count,
        verificationThreshold: raw.verification_threshold,
        category: raw.category?.name,
        status: raw.status,
        reportStatus: raw.report_status,
    };
}
