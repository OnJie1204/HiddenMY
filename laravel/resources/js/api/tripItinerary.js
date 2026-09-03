import api from '../api';

export const getTripItineraries = () =>
    api.get('/trip-itineraries');

export const getTripItinerary = (id) =>
    api.get(`/trip-itineraries/${id}`);

// Read-only view of an itinerary shared through a travel post.
export const getSharedTripItinerary = (id) =>
    api.get(`/trip-itineraries/${id}/shared`);

// Clone a shared itinerary into the current user's own itineraries.
export const copyTripItinerary = (id) =>
    api.post(`/trip-itineraries/${id}/copy`);

export const addTripLocation = (itineraryId, data) =>
    api.post(`/trip-itineraries/${itineraryId}/locations`, data);

export const updateTripLocationOrder = (itineraryId, locations) =>
    api.put(`/trip-itineraries/${itineraryId}/locations/order`, locations);

export const deleteTripLocation = (itineraryId, locationId) =>
    api.delete(`/trip-itineraries/${itineraryId}/locations/${locationId}`);

export const createTripItinerary = (data) =>
    api.post('/trip-itineraries', data);

export const updateTripItinerary = (id, data) =>
    api.put(`/trip-itineraries/${id}`, data);

export const deleteTripItinerary = (id) =>
    api.delete(`/trip-itineraries/${id}`);
