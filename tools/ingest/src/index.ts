/**
 * @aptiva/ingest — source parsers, pinned fetch, mapper, blueprint
 * drafter, fit math and the common validate/dedupe pipeline
 * (playbook Sections 14–15, PH-3).
 */

export const INGEST_TOOL_VERSION = '0.1.0';

export * from './types.js';
export * from './normalize.js';
export * from './github.js';
export * from './mapper.js';
export * from './drafter.js';
export * from './fit.js';
export * from './pipeline.js';
export { parseDs01File, DS01_PARSER_VERSION } from './parsers/ds01.js';
export { parseGsm8k, DSM8K_PARSER_VERSION } from './parsers/dsm8k.js';
export { parseDs07File, DS07_PARSER_VERSION } from './parsers/ds07.js';
