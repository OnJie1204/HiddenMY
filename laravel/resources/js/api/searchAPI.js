import api from "../api";

export const searchPlaces = (query) =>
    api.get("/search", {
        params: {
            q: query,
        },
    });