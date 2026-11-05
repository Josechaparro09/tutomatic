#!/usr/bin/env node
// Shim: ejecuta el CLI en TypeScript sin paso de compilación.
import { register } from 'tsx/esm/api';
register();
await import('../src/cli.ts');
