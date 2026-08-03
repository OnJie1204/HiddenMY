import api from '../api';

export const getHiddenGems = (params = {}) => 
    api.get('/hidden-gems', { params });

export const getHiddenGemDetail = (id) => 
    api.get(`/hidden-gems/${id}`);

export const searchHiddenGems = (query, config = {}) =>
    api.get('/hidden-gems/search', { ...config, params: { query } });

export const getCategories = () => 
    api.get('/hidden-gems/categories');

export const getStates = () => 
    api.get('/hidden-gems/states');

export const createHiddenGem = (data) =>
    api.post('/hidden-gems', data, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });