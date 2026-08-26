import api from '../api';

export const getFavouriteAchievements = () =>
    api.get('/me/favourite-achievements');

export const updateFavouriteAchievements = (achievementKeys) =>
    api.put('/me/favourite-achievements', {
        achievement_keys: achievementKeys,
    });
