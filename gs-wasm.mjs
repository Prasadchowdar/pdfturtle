// Ghostscript via WebAssembly, used by server.mjs when no native gs is installed.
// Usage: node gs-wasm.mjs <input.pdf> <output.pdf> [gs args...]
// Real paths among the extra args (e.g. a PDFA_def.ps) are copied into the WASM filesystem.
import fs from 'node:fs';
import path from 'node:path';
import loadGs from '@okathira/ghostpdl-wasm';

const [input, output, ...args] = process.argv.slice(2);
const gs = await loadGs({ print: () => {}, printErr: (s) => process.stderr.write(s + '\n') });
gs.FS.writeFile('/in.pdf', fs.readFileSync(input));
const mapped = args.map((a) => {
  if (a.startsWith('-') || !fs.existsSync(a)) return a;
  const inner = '/' + path.basename(a);
  gs.FS.writeFile(inner, fs.readFileSync(a));
  return inner;
});
const flags = mapped.filter((a) => a.startsWith('-')), files = mapped.filter((a) => !a.startsWith('-'));
const code = gs.callMain([...flags, '-sOutputFile=/out.pdf', ...files, '/in.pdf']);
if (code) process.exit(code);
fs.writeFileSync(output, gs.FS.readFile('/out.pdf'));
