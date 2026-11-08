import { BaseAdapter } from './base-adapter.mjs';
import { GenericAdapter } from './generic-adapter.mjs';
import { NodeTypeScriptAdapter } from './node-typescript-adapter.mjs';
import { NextJsReactAdapter } from './nextjs-react-adapter.mjs';
import { PythonAdapter } from './python-adapter.mjs';
import { JavaSpringBootAdapter } from './java-spring-adapter.mjs';
import { ReactNativeAdapter } from './react-native-adapter.mjs';
import { FlutterAdapter } from './flutter-adapter.mjs';
import { AndroidAdapter } from './android-adapter.mjs';
import { IosAdapter } from './ios-adapter.mjs';

/**
 * Adapter Registry for EnvGuard Assessment Engine.
 */
export class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
  }

  /**
   * Registers an adapter instance.
   * Validates adapter against the BaseAdapter contract.
   * @param {BaseAdapter} adapter
   */
  register(adapter) {
    if (!(adapter instanceof BaseAdapter)) {
      throw new Error(`Cannot register adapter: object must be an instance of BaseAdapter.`);
    }
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter with id "${adapter.id}" is already registered.`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  /**
   * Returns an adapter by ID.
   * @param {string} id
   * @returns {BaseAdapter | undefined}
   */
  get(id) {
    return this.adapters.get(id);
  }

  /**
   * Returns all registered adapters.
   * @returns {BaseAdapter[]}
   */
  getAll() {
    return Array.from(this.adapters.values());
  }

  /**
   * Resolves all matching adapters for a given target application node.
   * Always includes the GenericAdapter, plus framework/language specific adapters sorted by confidence.
   * @param {object} target - Target application node from inventory graph
   * @param {object} context - Global assessment context
   * @returns {Array<{ adapter: BaseAdapter, detection: object }>}
   */
  resolveAdaptersForTarget(target, context) {
    const matches = [];

    for (const adapter of this.adapters.values()) {
      try {
        const detection = adapter.detect(target, context);
        if (detection && detection.matched) {
          matches.push({
            adapter,
            detection,
            confidence: detection.confidence ?? 1.0,
          });
        }
      } catch (err) {
        // If an adapter detection throws, record failure but do not crash the engine
        matches.push({
          adapter,
          detection: {
            matched: false,
            confidence: 0,
            reason: `Detection error: ${err.message}`,
          },
          confidence: 0,
        });
      }
    }

    // Sort by confidence descending, ensuring generic adapter is included but specialized adapters take precedence
    matches.sort((a, b) => {
      // Specialized adapters with high confidence go first
      if (a.adapter.id === 'generic' && b.adapter.id !== 'generic') return 1;
      if (b.adapter.id === 'generic' && a.adapter.id !== 'generic') return -1;
      return (b.confidence || 0) - (a.confidence || 0);
    });

    return matches.filter((m) => m.detection.matched);
  }
}

/**
 * Creates and initializes the default adapter registry with built-in adapters.
 * @returns {AdapterRegistry}
 */
export function createDefaultRegistry() {
  const registry = new AdapterRegistry();
  registry.register(new GenericAdapter());
  registry.register(new NodeTypeScriptAdapter());
  registry.register(new NextJsReactAdapter());
  registry.register(new PythonAdapter());
  registry.register(new JavaSpringBootAdapter());
  registry.register(new ReactNativeAdapter());
  registry.register(new FlutterAdapter());
  registry.register(new AndroidAdapter());
  registry.register(new IosAdapter());
  return registry;
}
