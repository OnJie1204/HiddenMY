import api from "../api";

export const getHiddenGems = () => api.get("/hidden-gems");

export const searchHiddenGems = (query, config = {}) =>
    api.get("/hidden-gems/search", { ...config, params: { query } });
