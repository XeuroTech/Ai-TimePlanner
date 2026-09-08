import { describe, it, expect } from 'vitest';
import { authErrorCode, friendlyAuthError, isUnexpectedAuthError } from './errors';

describe('authErrorCode', () => {
  it('returns the code from a Firebase-shaped error', () => {
    expect(authErrorCode({ code: 'auth/invalid-email' })).toBe('auth/invalid-email');
  });

  it('returns null when the error carries no code', () => {
    expect(authErrorCode(new Error('boom'))).toBeNull();
    expect(authErrorCode({})).toBeNull();
  });

  it('returns null for a non-object thrown value', () => {
    expect(authErrorCode('just a string')).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode(undefined)).toBeNull();
  });

  it('returns null when code is present but empty', () => {
    expect(authErrorCode({ code: '' })).toBeNull();
  });
});

describe('friendlyAuthError', () => {
  it('returns the mapped message for a known code', () => {
    expect(friendlyAuthError({ code: 'auth/wrong-password' })).toBe('Incorrect email or password.');
  });

  it('keeps the raw code visible for an unmapped code', () => {
    expect(friendlyAuthError({ code: 'auth/some-new-code' })).toBe(
      'Something went wrong (auth/some-new-code). Please try again.',
    );
  });

  it('falls back to a generic message when there is no code at all', () => {
    expect(friendlyAuthError(new Error('network down'))).toBe('Something went wrong. Please try again.');
  });
});

describe('isUnexpectedAuthError', () => {
  it('is false for a code we explicitly handle', () => {
    expect(isUnexpectedAuthError({ code: 'auth/user-not-found' })).toBe(false);
  });

  it('is true for a code outside the known map', () => {
    expect(isUnexpectedAuthError({ code: 'auth/some-new-code' })).toBe(true);
  });

  it('is true when there is no code at all', () => {
    expect(isUnexpectedAuthError(new Error('boom'))).toBe(true);
  });
});
