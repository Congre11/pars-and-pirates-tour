import next from 'eslint-config-next';

/**
 * eslint-config-next 16 ships a flat config array, so it is spread directly
 * rather than wrapped in FlatCompat.
 */
const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/sw.js'] },
  ...next,
];

export default eslintConfig;
