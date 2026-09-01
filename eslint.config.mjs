// eslint.config.mjs — a BUG net, not a style guide (2026-08-26).
//
// This repo is where the shape actually reached production. /app/billing shipped
// with `const user = await requireAuth(...)` reassigned four lines later by the
// card-on-file refresh, which throws "Assignment to constant variable" on EVERY
// request. The page 500'd for real users.
//
// Nothing caught it. `node --check` sees syntax and this is a runtime error. The
// 348 tests then in the suite either exercised the pure billingView or asserted
// on the handler's SOURCE TEXT: that file's source was read by three tests and
// executed by none. My own deploy check made it worse, because a 302 read
// ANONYMOUSLY looks healthy: the auth wall answers before any broken code runs.
//
// Every rule below is a DEFECT, never a preference. No formatting, no naming, no
// line length. A red run means something is broken, which is what keeps it worth
// running.
import globals from 'globals';

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**', '.next/**', 'public/vendor/**', 'coverage/**', 'archive/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      // NODE AND BROWSER GLOBALS TOGETHER. This repo mixes serverless handlers
      // with scripts served to a page (thanks.js, the shell's inline JS), and
      // they are not separable by path. Allowing both environments costs almost
      // nothing here: the bug class this net exists for is an undefined LOCAL
      // identifier (operatorHashes, a mistyped import), never a missing
      // environment global, and those are still caught in every file.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The repo is "type": "commonjs" and every api/ handler uses module.exports
    // except this one, which is ESM. VERIFIED NOT A BUG before silencing it:
    // GET /api/wc-tasks answers 200 with live Trello data, because Vercel builds
    // each function on its own rather than by the package type.
    files: ['**/*.mjs', 'api/wc-tasks.js'],
    languageOptions: { sourceType: 'module' },
  },
];
