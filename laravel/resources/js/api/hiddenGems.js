import api from '../api';

export const getHiddenGems = (params = {}) => 
    api.get('/hidden-gems', { params });

export const getHiddenGemDetail = (id) => 
    api.get(`/hidden-gems/${id}`);

export function searchHiddenGems(query, { signal, latitude, longitude } = {}) {
    return api.get('/hidden-gems/search', {
        params: { query, latitude, longitude },
        signal,
    });
}

export const getCategories = () => 
    api.get('/hidden-gems/categories');

export const getStates = () =>
    api.get('/hidden-gems/states');

export const geocodeAddress = (query) =>
    api.get('/hidden-gems/geocode', { params: { query } });

export const createHiddenGem = (data) =>
    api.post('/hidden-gems', data, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });

export const getMyHiddenGems = () =>
    api.get('/my-hidden-gems');

export const deleteHiddenGem = (id) =>
    api.patch(`/hidden-gems/${id}/status`, {status: "deleted"});