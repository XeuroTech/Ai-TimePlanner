import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('expo-router', () => ({
  Redirect: ({ href }: any) => <div data-testid="redirect" data-href={href} />,
}));

import OAuthRedirect from './oauthredirect';

describe('OAuthRedirect', () => {
  it('redirects to /backup, getting out of the way of the deep-link handler', () => {
    render(<OAuthRedirect />);
    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-href')).toBe('/backup');
  });
});
