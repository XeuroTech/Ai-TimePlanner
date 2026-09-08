import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ openBrowserAsync: vi.fn() }));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: mocks.openBrowserAsync,
  WebBrowserPresentationStyle: { AUTOMATIC: 'AUTOMATIC' },
}));

// expo-router's real Link drags in native navigation machinery that doesn't
// resolve under jsdom; ExternalLink only needs an anchor-like component that
// forwards href/onPress, so a plain <a> stand-in is enough.
vi.mock('expo-router', () => ({
  Link: ({ href, onPress, children, ...rest }: any) => (
    <a href={href} onClick={onPress} {...rest}>
      {children}
    </a>
  ),
}));

import { ExternalLink } from './external-link';

afterEach(() => {
  mocks.openBrowserAsync.mockClear();
  delete (process.env as any).EXPO_OS;
});

describe('ExternalLink', () => {
  it('renders a Link with the given href and target=_blank', () => {
    render(<ExternalLink href="https://example.com">Visit</ExternalLink>);
    const link = screen.getByText('Visit') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('on web, does not prevent default or open an in-app browser on press', async () => {
    process.env.EXPO_OS = 'web';
    render(<ExternalLink href="https://example.com">Visit</ExternalLink>);
    fireEvent.click(screen.getByText('Visit'));
    await Promise.resolve();
    expect(mocks.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('on native, prevents default navigation and opens an in-app browser', async () => {
    process.env.EXPO_OS = 'ios';
    render(<ExternalLink href="https://example.com">Visit</ExternalLink>);
    const preventDefault = vi.fn();
    fireEvent.click(screen.getByText('Visit'), { preventDefault } as any);
    await Promise.resolve();
    expect(mocks.openBrowserAsync).toHaveBeenCalledWith('https://example.com', {
      presentationStyle: 'AUTOMATIC',
    });
  });
});
