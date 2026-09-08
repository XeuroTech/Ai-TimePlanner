import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  validateEmail,
  validateSignupEmail,
  validatePassword,
  validateName,
  validateRequired,
  validateMatch,
} from './validation';

describe('normalizeEmail', () => {
  it('trims whitespace and lowercases the address', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });
});

describe('validateEmail', () => {
  it('rejects an empty value', () => {
    expect(validateEmail('')).toBe('Email is required.');
    expect(validateEmail('   ')).toBe('Email is required.');
  });

  it('rejects an address longer than 254 characters', () => {
    const longLocal = 'a'.repeat(250);
    expect(validateEmail(`${longLocal}@b.com`)).toBe('That email address is too long.');
  });

  it('rejects an address containing a double dot', () => {
    expect(validateEmail('a@b..com')).toBe('Enter a valid email address.');
  });

  it('rejects a malformed address', () => {
    expect(validateEmail('not-an-email')).toBe('Enter a valid email address.');
  });

  it('accepts a well-formed address', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });
});

describe('validateSignupEmail', () => {
  it('surfaces the plain format error first', () => {
    expect(validateSignupEmail('bad')).toBe('Enter a valid email address.');
  });

  it('suggests a fix for a known domain typo', () => {
    expect(validateSignupEmail('user@gmial.com')).toBe('Did you mean user@gmail.com?');
  });

  it('rejects a known undeliverable domain', () => {
    expect(validateSignupEmail('user@example.com')).toBe(
      'Please use a real email address — this one cannot receive the verification email.'
    );
  });

  it('rejects a known disposable domain', () => {
    expect(validateSignupEmail('user@mailinator.com')).toBe(
      'Temporary email addresses are not supported. Please use a permanent one.'
    );
  });

  it('accepts a legitimate, deliverable address', () => {
    expect(validateSignupEmail('user@gmail.com')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toBe('Password is required.');
  });

  it('rejects a password shorter than 6 characters', () => {
    expect(validatePassword('abc12')).toBe('Password must be at least 6 characters.');
  });

  it('accepts a password of at least 6 characters', () => {
    expect(validatePassword('abc123')).toBeNull();
  });
});

describe('validateName', () => {
  it('rejects an empty or whitespace-only name', () => {
    expect(validateName('')).toBe('Name is required.');
    expect(validateName('   ')).toBe('Name is required.');
  });

  it('rejects a name shorter than 2 characters after trimming', () => {
    expect(validateName(' a ')).toBe('Name is too short.');
  });

  it('accepts a valid name', () => {
    expect(validateName('Ana')).toBeNull();
  });
});

describe('validateRequired', () => {
  it('rejects an empty value using the default label', () => {
    expect(validateRequired('')).toBe('This field is required.');
  });

  it('rejects an empty value using a custom label', () => {
    expect(validateRequired('  ', 'Subject')).toBe('Subject is required.');
  });

  it('accepts a non-empty value', () => {
    expect(validateRequired('hello')).toBeNull();
  });
});

describe('validateMatch', () => {
  it('returns null when both values match', () => {
    expect(validateMatch('secret', 'secret')).toBeNull();
  });

  it('returns an error when values differ', () => {
    expect(validateMatch('secret', 'other')).toBe('Passwords do not match.');
  });
});
