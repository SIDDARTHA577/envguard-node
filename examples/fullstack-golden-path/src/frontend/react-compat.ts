// React-compatible interfaces and hooks for lightweight standalone execution

export interface FormEvent {
  preventDefault: () => void;
}

export interface FC<P = {}> {
  (props: P): any;
}

export function useState<T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  let value = typeof initial === 'function' ? (initial as () => T)() : initial;
  const setter = (next: T | ((prev: T) => T)) => {
    value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
  };
  return [value, setter];
}

export function useEffect(fn: () => void | (() => void), _deps?: any[]): void {
  fn();
}

export function useCallback<T extends (...args: any[]) => any>(fn: T, _deps?: any[]): T {
  return fn;
}

export const React = {
  useState,
  useEffect,
  useCallback,
};

export default React;
