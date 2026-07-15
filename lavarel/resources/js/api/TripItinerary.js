import api from '../api';

export const getTripItineraries = () =>
    api.get('/trip-itineraries');

export const createTripItinerary = (data) =>
    api.post('/trip-itineraries', data);

export const updateTripItinerary = (id, data) =>
    api.put(`/trip-itineraries/${id}`, data);

export const deleteTripItinerary = (id) =>
    api.delete(`/trip-itineraries/${id}`);