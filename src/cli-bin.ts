#!/usr/bin/env node
import { runCli } from './cli/index.js';

runCli()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    console.error('Fatal CLI error:', err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
