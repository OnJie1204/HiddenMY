import api from '../api';


export const getHiddenGems = () =>
    api.get('/hidden-gems');


export const createHiddenGem = (data) =>
    api.post('/hidden-gems', data);


export const updateHiddenGem = (id,data) =>
    api.put(`/hidden-gems/${id}`,data);


export const deleteHiddenGem = (id) =>
    api.delete(`/hidden-gems/${id}`);