import api from '../api';

export const getMyVotes = () => api.get('/my-votes');

export const updateVoteComment = (voteId, comment) =>
    api.patch(`/votes/${voteId}/comment`, { comment });

export const deleteVoteComment = (voteId) =>
    api.delete(`/votes/${voteId}/comment`);

export const deleteVotePhoto = (voteId) =>
    api.delete(`/votes/${voteId}/photo`);
