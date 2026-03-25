'use strict';

/**
 * One-off / CI seed: boots Strapi once; {@link ../src/bootstrap.js} runs on load and imports seed data on first run.
 */
async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  await app.destroy();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
