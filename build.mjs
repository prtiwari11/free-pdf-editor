// Copies the static site into dist/ for deployment (no bundling needed).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = new URL('./dist/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['index.html', 'app.js', 'styles.css', 'vendor', 'fonts']) {
  cpSync(new URL(f, import.meta.url), new URL(f, out), { recursive: true });
}
// Cloudflare static-asset headers: cache libraries and fonts, revalidate the app.
writeFileSync(new URL('_headers', out), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/vendor/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: no-cache
/app.js
  Cache-Control: no-cache
/styles.css
  Cache-Control: no-cache
`);
console.log('Built dist/');
