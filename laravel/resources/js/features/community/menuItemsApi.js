import api from "../../api";

export const getMenuItems = (locationId) =>
    api.get(`/hidden-gems/${locationId}/menu-items`);

export const addMenuItem = (locationId, { name, price }) =>
    api.post(`/hidden-gems/${locationId}/menu-items`, { name, price: price || undefined });

export const toggleMenuItemLike = (menuItemId) =>
    api.post(`/menu-items/${menuItemId}/like`);

export const deleteMenuItem = (menuItemId) =>
    api.delete(`/menu-items/${menuItemId}`);
