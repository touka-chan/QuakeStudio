/*
 * Export the frontend's content contract for the backend.
 *
 * The backend does not re-declare the 300-line content shape by hand. It loads
 * `content_schema.json`, generated from the same Zod schema the admin already
 * validates against, so a field the app accepts cannot silently become a field
 * the API rejects.
 *
 * Run from the repository root:
 *   npm run backend:content
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { buildDefaultContent } from '../../apps/web/src/content/defaults';
import { contentDocumentSchema } from '../../apps/web/src/content/schema';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '../../apps/api');

const schema = z.toJSONSchema(contentDocumentSchema, {
  io: 'input',
  target: 'draft-2020-12',
  unrepresentable: 'any',
});

const document = contentDocumentSchema.parse(buildDefaultContent());

mkdirSync(resolve(apiRoot, 'app'), { recursive: true });
mkdirSync(resolve(apiRoot, 'seed'), { recursive: true });

writeFileSync(
  resolve(apiRoot, 'app/content_schema.json'),
  `${JSON.stringify({ title: 'QuakeStudio content document', ...schema }, null, 2)}\n`,
);
writeFileSync(resolve(apiRoot, 'seed/content.json'), `${JSON.stringify(document, null, 2)}\n`);

console.log(
  `Wrote content_schema.json and seed/content.json (${Object.keys(document).length} top-level sections).`,
);
