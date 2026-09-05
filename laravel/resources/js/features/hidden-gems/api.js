import api from '../../api';

export const getHiddenGems = (params = {}) =>
    api.get('/hidden-gems', { params });

// Well-known places — gems the community has outgrown. Same response shape as
// getHiddenGems; deliberately a separate list from the Hidden Gems browse.
export const getWellKnownPlaces = (params = {}) =>
    api.get('/well-known-places', { params });

export const getHiddenGemDetail = (id) => 
    api.get(`/hidden-gems/${id}`);

export function searchHiddenGems(query, { signal, latitude, longitude, dbOffset, osmOffset } = {}) {
    return api.get('/hidden-gems/search', {
        params: {
            query,
            latitude,
            longitude,
            db_offset: dbOffset || undefined,
            osm_offset: osmOffset || undefined,
        },
        signal,
    });
}

export const reverseGeocodeAddress = (latitude, longitude) =>
    api.get('/hidden-gems/reverse-geocode-address', {
        params: {
            latitude,
            longitude
        }
    });

export const getCategories = () => 
    api.get('/hidden-gems/categories');

export const getStates = () =>
    api.get('/hidden-gems/states');

export const geocodeAddress = (query) =>
    api.get('/hidden-gems/geocode', { params: { query } });

// Live address type-ahead for the Submit / Edit Hidden Gem forms (Photon).
// Pass an AbortController signal so superseded keystrokes get cancelled.
export const autocompleteAddress = (query, { signal, latitude, longitude } = {}) =>
    api.get('/hidden-gems/address-autocomplete', {
        params: {
            query,
            latitude: latitude || undefined,
            longitude: longitude || undefined,
        },
        signal,
    });

export const reverseGeocodeLocation = (latitude, longitude) =>
    api.get('/hidden-gems/reverse-geocode', { params: { latitude, longitude } });

export const createHiddenGem = (data) =>
    api.post('/hidden-gems', data, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

export const updateHiddenGem = (id, data) => {
    if (data instanceof FormData) {
        data.append('_method', 'PUT');
        return api.post(`/hidden-gems/${id}`, data);
    }

    return api.put(`/hidden-gems/${id}`, data);
};

export const getMyHiddenGems = () =>
    api.get('/my-hidden-gems');

export const getPopularHiddenGems = () =>
    api.get('/popular-hidden-gems');

export const getRecentHiddenGems = () =>
    api.get('/recent-hidden-gems');

export const getNearbyAttractions = (id, radius) =>
    api.get(`/hidden-gems/${id}/nearby`, { params: radius ? { radius } : {} });

export const getNearbyGems = (id, radius) =>
    api.get(`/hidden-gems/${id}/nearby-gems`, { params: radius ? { radius } : {} });

// Nearby attractions around an arbitrary coordinate (map "explore nearby" mode)
export const getNearbyAttractionsAt = (latitude, longitude, radius) =>
    api.get('/nearby-attractions', { params: { latitude, longitude, radius } });

// Hidden gems inside the map's current viewport
export const getHiddenGemsInBounds = (bounds, status) =>
    api.get('/hidden-gems-in-bounds', { params: { ...bounds, ...(status ? { status } : {}) } });

export const deleteHiddenGem = (id) =>
    api.patch(`/hidden-gems/${id}/status`, {status: "deleted"});
