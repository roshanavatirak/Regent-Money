// Usage: node --experimental-strip-types --import ./scripts/test/register.mjs --test <files>
import { register } from 'node:module';

register('./node-ts-hooks.mjs', import.meta.url);
