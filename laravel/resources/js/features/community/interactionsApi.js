import api from "../../api";

export const getMyRatings = () => api.get("/my-ratings");

export const getInteractions = (locationId) => api.get(`/gem-interactions/${locationId}`);

export const submitComment = (locationId, formData) =>
    api.post(`/gem-interactions/${locationId}`, formData);

export const updateComment = (commentId, formData) =>
    api.post(`/gem-interactions/comments/${commentId}`, formData);
