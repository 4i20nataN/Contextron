import fs from 'fs';
const text = fs.readFileSync('src/constants.ts', 'utf-8');
const p1Start = text.indexOf('export const PHASE1_SYSTEM_PROMPT');
const p2Start = text.indexOf('export const PHASE2_SYSTEM_PROMPT');
const p3Start = text.indexOf('export const PHASE3_SYSTEM_PROMPT');

const p1 = text.substring(p1Start, p2Start);
const p2 = text.substring(p2Start, p3Start);
const p3 = text.substring(p3Start);
const constants = text.substring(0, p1Start);

fs.mkdirSync('src/prompts', { recursive: true });
fs.writeFileSync('src/prompts/phase1.ts', p1);
fs.writeFileSync('src/prompts/phase2.ts', p2);
fs.writeFileSync('src/prompts/phase3.ts', p3);
fs.writeFileSync('src/constants.ts', constants + "export * from './prompts/phase1';\nexport * from './prompts/phase2';\nexport * from './prompts/phase3';\n");
console.log('Prompts separated successfully.');
