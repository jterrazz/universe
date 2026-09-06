import { oxfmt } from '@jterrazz/typescript';
import { defineConfig } from 'oxfmt';

export default defineConfig({
    ...oxfmt,
    /*
     * Committed fixture trees and expected-output snapshots are byte-for-byte
     * significant — they lock in spwn's CLI output and YAML/project fixtures —
     * so the formatter must leave them alone. A `<case>.spec.yaml` document
     * carries its expected streams in the same way: the formatter would rewrite
     * a golden line that ends on a space, which is output, not style. Its shape
     * is checked by the @jterrazz/test conventions checker instead.
     */
    ignorePatterns: [
        ...(oxfmt.ignorePatterns ?? []),
        'specs/_fixtures/**',
        'specs/cli/**/*.spec.yaml',
        'specs/cli/**/_expected/**',
        'specs/cli/**/_fixtures/**',
        'web/**',
        '_smoke/**',
        '_catalog/**',
        '_contracts/**',
        '_simulators/**',
    ],
});
