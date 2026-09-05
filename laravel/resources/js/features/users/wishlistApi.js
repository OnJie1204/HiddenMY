import api from '../../api';

export const getWishlist = () =>
    api.get('/wishlist');

export const addToWishlist = (locationId) =>
    api.post(`/wishlist/${locationId}`);

export const removeFromWishlist = (locationId) =>
    api.delete(`/wishlist/${locationId}`);
