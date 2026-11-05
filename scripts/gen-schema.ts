// Regenera schema/*.schema.json a partir de src/lib/schema.ts:  npx tsx scripts/gen-schema.ts
import { z } from 'zod';
import fs from 'node:fs';
import { Storyboard, Brand } from '../src/lib/schema.ts';
fs.writeFileSync('schema/storyboard.schema.json', JSON.stringify(z.toJSONSchema(Storyboard, { io: 'input' }), null, 2));
fs.writeFileSync('schema/brand.schema.json', JSON.stringify(z.toJSONSchema(Brand, { io: 'input' }), null, 2));
