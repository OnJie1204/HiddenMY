import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TravelPostDetail from '../../resources/js/pages/travel/TravelPostDetail';
import { getTravelPostDetail } from '../../resources/js/features/travel/travelPostsApi';

vi.mock('@/context/auth/AuthPromptContext', () => ({
    useAuthPrompt: () => ({ requireAuth: vi.fn() }),
}));
vi.mock('@/features/auth/api', () => ({
    getMe: () => Promise.reject({ response: { status: 401 } }),
}));
vi.mock('@/features/travel/travelPostsApi', () => ({
    getTravelPostDetail: vi.fn(),
    deleteTravelPost: vi.fn(),
    copyPostTrip: vi.fn(),
}));

afterEach(cleanup);

it('shows a friendly message for any missing travel post', async () => {
    getTravelPostDetail.mockRejectedValue({
        response: {
            status: 404,
            data: { message: 'No query results for model [App\\Models\\TravelPost] 999999' },
        },
    });

    render(
        <MemoryRouter initialEntries={['/travel-posts/999999']}>
            <Routes>
                <Route path="/travel-posts/:id" element={<TravelPostDetail user={null} />} />
            </Routes>
        </MemoryRouter>
    );

    expect(await screen.findByText('Travel post not found.')).toBeTruthy();
    expect(screen.queryByText(/No query results for model/)).toBeNull();
});
