import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

if (process.env.PROJECTCORE_MIGRATE_ON_BUILD === '1') {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    stdio: 'inherit'
  });
}
