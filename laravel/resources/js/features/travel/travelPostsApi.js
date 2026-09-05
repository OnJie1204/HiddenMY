import api from '../../api';

export const getTravelPosts = (params = {}) =>
    api.get('/travel-posts', { params });

export const getTravelPostDetail = (id) =>
    api.get(`/travel-posts/${id}`);

export const getMyTravelPosts = () =>
    api.get('/my-travel-posts');

export const getTravelPostsForLocation = (locationId) =>
    api.get(`/locations/${locationId}/travel-posts`);

export const createTravelPost = (data) =>
    api.post('/travel-posts', data, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

export const updateTravelPost = (id, data) => {
    data.append('_method', 'PUT');
    return api.post(`/travel-posts/${id}`, data, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
};

export const deleteTravelPost = (id) =>
    api.delete(`/travel-posts/${id}`);

// Reader action — clone this post's frozen trip snapshot into a new itinerary
// of the current user's. Deleted / permanently-closed stops are skipped.
export const copyPostTrip = (id) =>
    api.post(`/travel-posts/${id}/copy-trip`);
