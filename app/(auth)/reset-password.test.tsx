import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('expo-router', () => ({
  Redirect: ({ href }: any) => <div data-testid="redirect" data-href={href} />,
}));

import ResetPasswordScreen from './reset-password';

describe('ResetPasswordScreen', () => {
  it('redirects to /login (password resets happen via the Firebase email link, not in-app)', () => {
    render(<ResetPasswordScreen />);
    const redirect = screen.getByTestId('redirect');
    expect(redirect.getAttribute('data-href')).toBe('/login');
  });
});
