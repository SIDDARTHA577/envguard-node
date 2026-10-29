import { BaseValidator } from './base.js';
import type { ValidatorResult } from '../types.js';

export interface UrlValidatorOptions {
  protocols?: string[];
}

export class UrlValidator extends BaseValidator<string> {
  public readonly type = 'url';
  private readonly allowedProtocols?: Set<string>;

  constructor(options: UrlValidatorOptions = {}) {
    super();
    if (options.protocols) {
      this.allowedProtocols = new Set(
        options.protocols.map((p) => (p.endsWith(':') ? p.toLowerCase() : `${p.toLowerCase()}:`))
      );
    }
  }

  protected coerceAndValidate(raw: unknown, key: string): ValidatorResult<string> {
    if (typeof raw !== 'string') {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_type',
            `Variable "${key}" must be a URL string. Received: ${typeof raw}.`,
            { expected: 'url string', receivedType: typeof raw }
          ),
        ],
      };
    }

    const trimmed = raw.trim();
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_format',
            `Variable "${key}" is not a valid absolute URL.`,
            { expected: 'valid URL (e.g. https://...)' }
          ),
        ],
      };
    }

    if (this.allowedProtocols && !this.allowedProtocols.has(parsed.protocol.toLowerCase())) {
      const allowedList = Array.from(this.allowedProtocols).join(', ');
      return {
        valid: false,
        errors: [
          this.createError(
            key,
            'invalid_format',
            `Variable "${key}" has invalid protocol. Allowed: ${allowedList}.`,
            { expected: allowedList }
          ),
        ],
      };
    }

    return { valid: true, value: trimmed };
  }
}
