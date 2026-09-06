import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HiddenGemSubmission from '@/pages/hidden-gems/HiddenGemSubmission';

vi.mock('@/features/hidden-gems/api', () => ({
    getCategories: async () => ({ data: { data: [] } }),
    geocodeAddress: async () => ({ data: {
        state: 'Penang', latitude: 5.4, longitude: 100.3, name: 'Example address',
    } }),
    createHiddenGem: vi.fn(),
}));
vi.mock('@/components/hidden-gems/AddressAutocomplete', () => ({
    default: ({ value, onChange }) => <input placeholder="Address" value={value}
        onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('@/components/hidden-gems/LocationPickerMap', () => ({ default: () => null }));

afterEach(cleanup);

it('selects the detected state after address lookup and still allows manual correction', async () => {
    const { container } = render(<MemoryRouter><HiddenGemSubmission /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('Address'), { target: { value: 'Example address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find Location from Address' }));

    const stateSelect = container.querySelector('select[name="state"]');
    await waitFor(() => expect(stateSelect.value).toBe('Penang'));
    fireEvent.change(stateSelect, { target: { value: 'Selangor' } });
    expect(stateSelect.value).toBe('Selangor');
});
