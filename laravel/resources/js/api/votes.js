import api from '../api';

export const checkVoteEligibility = (locationId) =>
    api.get(`/votes/check/${locationId}`);

export const submitVote = (locationId, { latitude, longitude }) =>
    api.post(`/votes/${locationId}`, {
        latitude,
        longitude,
    });

export const getMyVotes = () =>
    api.get('/my-votes');