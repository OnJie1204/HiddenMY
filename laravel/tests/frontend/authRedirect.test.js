import { describe, expect, it } from 'vitest';
import { guestReturnPath } from '../../resources/js/utils/auth/authRedirect';

describe('Continue as Guest', () => {
    it.each([
        ['/travel-posts?mine=1', '/travel-posts'],
        ['/travel-posts?mine=1&state=Johor#posts', '/travel-posts?state=Johor#posts'],
        ['/travel-posts/42', '/travel-posts/42'],
        ['/travel-posts/create', '/'],
        ['/travel-posts/42/edit', '/'],
        ['/profile', '/'],
        ['//example.com', '/'],
    ])('returns safely from %s', (from, expected) => {
        expect(guestReturnPath({ state: { from } })).toBe(expected);
    });
});
