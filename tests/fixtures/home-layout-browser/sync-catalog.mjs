// Use every canonical definition; preserve only the fixture's sample wording.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { cloneBuiltInDefinitions } = require('../../../../backend/lib/crm_component_definition_catalog.js');
const path = new URL('./content.json', import.meta.url);
const sample = JSON.parse(readFileSync(path, 'utf8'));
const samplesById = new Map(sample.definitions.map(item => [item.id, item.defaultContent]));
sample.definitions = cloneBuiltInDefinitions().map(definition => ({
  ...definition, defaultContent: { ...definition.defaultContent, ...samplesById.get(definition.id) },
}));
const next = JSON.stringify(sample, null, 2) + '\n';
if (readFileSync(path, 'utf8') !== next) writeFileSync(path, next);
