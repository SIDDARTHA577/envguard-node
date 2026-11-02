import { describe, it, expect } from 'vitest';
import { s } from '../src/schema.js';
import { EnvGuardSchemaError } from '../src/errors.js';

describe('Validators', () => {
  describe('StringValidator', () => {
    it('validates standard strings', () => {
      const v = s.string();
      expect(v.validate('hello', 'KEY')).toEqual({ valid: true, value: 'hello' });
    });

    it('rejects non-strings', () => {
      const v = s.string();
      const res = v.validate(123, 'KEY');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors[0].issue).toBe('invalid_type');
      }
    });

    it('enforces min and max lengths', () => {
      const v = s.string({ min: 3, max: 6 });
      expect(v.validate('ab', 'KEY').valid).toBe(false);
      expect(v.validate('abc', 'KEY').valid).toBe(true);
      expect(v.validate('abcdef', 'KEY').valid).toBe(true);
      expect(v.validate('abcdefg', 'KEY').valid).toBe(false);
    });

    it('enforces regex patterns', () => {
      const v = s.string({ pattern: /^[A-Z]{3}$/ });
      expect(v.validate('ABC', 'KEY').valid).toBe(true);
      expect(v.validate('abc', 'KEY').valid).toBe(false);
      expect(v.validate('ABCD', 'KEY').valid).toBe(false);
    });

    it('enforces choices', () => {
      const v = s.string({ choices: ['red', 'green', 'blue'] });
      expect(v.validate('red', 'COLOR').valid).toBe(true);
      expect(v.validate('yellow', 'COLOR').valid).toBe(false);
    });

    it('trims whitespace when .trim() is used', () => {
      const v = s.string({ min: 3 }).trim();
      expect(v.validate('   abc   ', 'KEY')).toEqual({ valid: true, value: 'abc' });
      // without trim '  ' would be 2 characters
      const untrimmed = s.string({ min: 3 });
      expect(untrimmed.validate(' a ', 'KEY').valid).toBe(true);
      const trimmed = s.string({ min: 3 }).trim();
      expect(trimmed.validate(' a ', 'KEY').valid).toBe(false);
    });

    it('enforces nonempty strings when .nonempty() is used', () => {
      const v = s.string().nonempty();
      expect(v.validate('a', 'KEY').valid).toBe(true);
      expect(v.validate('', 'KEY').valid).toBe(false);
    });
  });

  describe('NumberValidator and IntegerValidator', () => {
    it('parses numeric strings and numbers', () => {
      const v = s.number();
      expect(v.validate('42', 'COUNT')).toEqual({ valid: true, value: 42 });
      expect(v.validate(42, 'COUNT')).toEqual({ valid: true, value: 42 });
      expect(v.validate('-3.14', 'TEMP')).toEqual({ valid: true, value: -3.14 });
    });

    it('rejects malformed numbers and NaNs', () => {
      const v = s.number();
      expect(v.validate('not-a-number', 'COUNT').valid).toBe(false);
      expect(v.validate('  ', 'COUNT').valid).toBe(false);
      expect(v.validate(NaN, 'COUNT').valid).toBe(false);
      expect(v.validate(Infinity, 'COUNT').valid).toBe(false);
    });

    it('enforces numeric min and max', () => {
      const v = s.number({ min: 10, max: 20 });
      expect(v.validate('9', 'NUM').valid).toBe(false);
      expect(v.validate('10', 'NUM').valid).toBe(true);
      expect(v.validate('20', 'NUM').valid).toBe(true);
      expect(v.validate('21', 'NUM').valid).toBe(false);
    });

    it('rejects float values for IntegerValidator', () => {
      const v = s.integer();
      expect(v.validate('42', 'PORT').valid).toBe(true);
      expect(v.validate('42.5', 'PORT').valid).toBe(false);
    });
  });

  describe('BooleanValidator', () => {
    it('correctly coerces truthy values', () => {
      const v = s.boolean();
      expect(v.validate('true', 'FLAG')).toEqual({ valid: true, value: true });
      expect(v.validate('TRUE', 'FLAG')).toEqual({ valid: true, value: true });
      expect(v.validate('1', 'FLAG')).toEqual({ valid: true, value: true });
      expect(v.validate('yes', 'FLAG')).toEqual({ valid: true, value: true });
      expect(v.validate('on', 'FLAG')).toEqual({ valid: true, value: true });
      expect(v.validate(true, 'FLAG')).toEqual({ valid: true, value: true });
    });

    it('correctly coerces falsy values', () => {
      const v = s.boolean();
      expect(v.validate('false', 'FLAG')).toEqual({ valid: true, value: false });
      expect(v.validate('FALSE', 'FLAG')).toEqual({ valid: true, value: false });
      expect(v.validate('0', 'FLAG')).toEqual({ valid: true, value: false });
      expect(v.validate('no', 'FLAG')).toEqual({ valid: true, value: false });
      expect(v.validate('off', 'FLAG')).toEqual({ valid: true, value: false });
      expect(v.validate(false, 'FLAG')).toEqual({ valid: true, value: false });
    });

    it('rejects invalid boolean strings', () => {
      const v = s.boolean();
      expect(v.validate('maybe', 'FLAG').valid).toBe(false);
      expect(v.validate('2', 'FLAG').valid).toBe(false);
      expect(v.validate('none', 'FLAG').valid).toBe(false);
    });
  });

  describe('PortValidator', () => {
    it('accepts valid network ports', () => {
      const v = s.port();
      expect(v.validate('80', 'PORT')).toEqual({ valid: true, value: 80 });
      expect(v.validate('8080', 'PORT')).toEqual({ valid: true, value: 8080 });
      expect(v.validate(3000, 'PORT')).toEqual({ valid: true, value: 3000 });
      expect(v.validate('65535', 'PORT')).toEqual({ valid: true, value: 65535 });
    });

    it('rejects out of range or non-integer ports', () => {
      const v = s.port();
      expect(v.validate('0', 'PORT').valid).toBe(false);
      expect(v.validate('-1', 'PORT').valid).toBe(false);
      expect(v.validate('65536', 'PORT').valid).toBe(false);
      expect(v.validate('3000.5', 'PORT').valid).toBe(false);
      expect(v.validate('abc', 'PORT').valid).toBe(false);
    });
  });

  describe('UrlValidator', () => {
    it('accepts valid URLs', () => {
      const v = s.url();
      expect(v.validate('https://example.com/api', 'API_URL')).toEqual({
        valid: true,
        value: 'https://example.com/api',
      });
      expect(v.validate('postgres://user:pass@localhost:5432/db', 'DB_URL')).toEqual({
        valid: true,
        value: 'postgres://user:pass@localhost:5432/db',
      });
    });

    it('rejects invalid URLs', () => {
      const v = s.url();
      expect(v.validate('not-a-valid-url', 'URL').valid).toBe(false);
      expect(v.validate('/relative/path', 'URL').valid).toBe(false);
    });

    it('enforces allowed protocols', () => {
      const v = s.url({ protocols: ['https:'] });
      expect(v.validate('https://secure.example.com', 'URL').valid).toBe(true);
      expect(v.validate('http://insecure.example.com', 'URL').valid).toBe(false);
      expect(v.validate('ftp://files.example.com', 'URL').valid).toBe(false);
    });
  });

  describe('EnumValidator', () => {
    it('accepts allowed enum values', () => {
      const v = s.enum(['development', 'staging', 'production'] as const);
      expect(v.validate('development', 'NODE_ENV')).toEqual({
        valid: true,
        value: 'development',
      });
    });

    it('rejects disallowed enum values', () => {
      const v = s.enum(['development', 'staging', 'production'] as const);
      expect(v.validate('local', 'NODE_ENV').valid).toBe(false);
      expect(v.validate(123, 'NODE_ENV').valid).toBe(false);
    });

    it('throws when initialized with empty array', () => {
      expect(() => s.enum([] as unknown as readonly string[])).toThrow(EnvGuardSchemaError);
    });
  });

  describe('Custom Validators and Safe Execution', () => {
    it('executes custom validation functions returning boolean', () => {
      const v = s.string().custom((val) => val.startsWith('prefix_'), 'must start with prefix_');
      expect(v.validate('prefix_123', 'KEY').valid).toBe(true);
      expect(v.validate('other_123', 'KEY').valid).toBe(false);
    });

    it('executes custom validation functions returning error string', () => {
      const v = s.string().custom((val) => {
        if (!val.includes('@')) return 'must contain @ symbol';
        return true;
      });
      expect(v.validate('user@domain.com', 'EMAIL').valid).toBe(true);
      const res = v.validate('user-without-at', 'EMAIL');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors[0].message).toContain('must contain @ symbol');
      }
    });

    it('safely handles throwing custom functions without crashing or leaking', () => {
      const v = s.string().custom(() => {
        throw new Error('Explosion with sensitive secret sk_live_secret123');
      });
      const res = v.validate('any_value', 'KEY');
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors[0].message).toBe('Custom validator threw an error for "KEY".');
        expect(res.errors[0].message).not.toContain('sk_live_secret123');
      }
    });
  });
});

