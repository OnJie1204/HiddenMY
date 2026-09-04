import api from "../api";

export const getMyRatings = () => api.get("/my-ratings");

export const getInteractions = (locationId) => api.get(`/gem-interactions/${locationId}`);
