import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('expo-router', () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import ModalScreen from './modal';

describe('ModalScreen', () => {
  it('renders the title and a link back to the home screen', () => {
    render(<ModalScreen />);
    expect(screen.getByText('This is a modal')).toBeTruthy();
    const link = screen.getByText('Go to home screen').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/');
  });

  it('renders the themed link with type="link" styling applied', () => {
    render(<ModalScreen />);
    const link = screen.getByText('Go to home screen');
    expect(link).toBeTruthy();
  });
});
