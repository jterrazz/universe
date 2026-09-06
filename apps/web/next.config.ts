import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';

// Only use static export for explicit Tauri production builds (npm run build:static)
const isStaticExport = process.env.TAURI_STATIC_BUILD === '1';

// Bake the app version into the bundle so the frontend can compare
// It against the latest release without depending on the CLI binary.
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const nextConfig: NextConfig = {
    ...(isStaticExport ? { output: 'export' } : {}),
    /*
     * Next writes under `.artifacts/`, like every other tool here. The
     * name means two different things depending on the mode: a server
     * build treats `distDir` as its build directory, while an
     * `output: 'export'` build treats it as the EXPORT directory (it
     * forces its own scratch back to `.next/` — see
     * `hasCustomExportOutput` in next/dist/export/utils.js), so the
     * static build names a subfolder and `build:static` removes the
     * scratch Next insists on putting at the package root.
     */
    distDir: isStaticExport ? '.artifacts/next/export' : '.artifacts/next',
    // Allow LAN devices to access the dev server (HMR, webpack, etc.)
    allowedDevOrigins: ['local://', '*.local', '192.168.*.*', '10.*.*.*'],
    images: {
        unoptimized: true,
    },
    env: {
        NEXT_PUBLIC_APP_VERSION: pkg.version,
    },
};

export default nextConfig;
