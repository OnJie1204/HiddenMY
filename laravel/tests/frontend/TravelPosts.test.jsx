import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import TravelPosts from '../../resources/js/pages/travel/TravelPosts';
import { getMyTravelPosts, getTravelPosts } from '../../resources/js/features/travel/travelPostsApi';

const { requireAuth } = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock('@/context/auth/AuthPromptContext', () => ({ useAuthPrompt: () => ({ requireAuth }) }));
vi.mock('@/features/travel/travelPostsApi', () => ({ getMyTravelPosts: vi.fn(), getTravelPosts: vi.fn() }));
vi.mock('@/features/hidden-gems/api', () => ({
    getCategories: () => Promise.resolve({ data: { data: [] } }),
    getStates: () => Promise.resolve({ data: { data: [] } }),
}));

function Navigation() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output data-testid="url">{location.pathname}{location.search}</output>
        <button onClick={() => navigate(-1)}>Back</button></>;
}

function mount(user = null, path = '/travel-posts?mine=1&state=Johor') {
    return render(<StrictMode><MemoryRouter initialEntries={[path]}>
        <TravelPosts user={user} /><Navigation />
    </MemoryRouter></StrictMode>);
}

beforeEach(() => {
    getTravelPosts.mockResolvedValue({ data: { data: [] } });
    getMyTravelPosts.mockResolvedValue({ data: { data: [] } });
});
afterEach(cleanup);

it('loads public posts for a guest direct link without calling the protected API', async () => {
    mount();
    await screen.findByText('No Travel Posts Yet');
    expect(getMyTravelPosts).not.toHaveBeenCalled();
    expect(getTravelPosts).toHaveBeenCalledWith({ state: 'Johor', category: '' });
    expect(screen.getByTestId('url').textContent).toBe('/travel-posts?state=Johor');
    expect(screen.getByText('All Posts').className).toBe('active');
});

it('prompts guests to sign in for My Posts without fetching private data', async () => {
    mount(null, '/travel-posts');
    await screen.findByText('No Travel Posts Yet');
    fireEvent.click(screen.getByText('My Posts'));
    expect(requireAuth).toHaveBeenCalledWith({ reason: 'viewMyTravelPosts', returnTo: '/travel-posts?mine=1' });
    expect(getMyTravelPosts).not.toHaveBeenCalled();
});

it('loads authenticated My Posts and switches to public posts', async () => {
    mount({ id: 1 });
    await screen.findByText("You haven't written a travel post yet.");
    expect(getMyTravelPosts).toHaveBeenCalled();
    expect(getTravelPosts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('All Posts'));
    await waitFor(() => expect(getTravelPosts).toHaveBeenCalled());
    expect(screen.getByTestId('url').textContent).toBe('/travel-posts?state=Johor');
});

it('updates the selected tab when router navigation changes the query', async () => {
    render(<MemoryRouter initialEntries={['/travel-posts', '/travel-posts?mine=1']} initialIndex={1}>
        <TravelPosts user={{ id: 1 }} /><Navigation />
    </MemoryRouter>);
    await screen.findByText("You haven't written a travel post yet.");
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => expect(getTravelPosts).toHaveBeenCalled());
    expect(screen.getByText('All Posts').className).toBe('active');
});
