'use strict';

const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const demoContent = require('../data/demo/content.json');

const TOKEN_NAME = 'SimplicityVibe Backend';

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function ensureIntegrationToken(app, accessKey) {
  if (!accessKey) {
    app.log.info('[deployment] STRAPI_API_TOKEN is not set; API token provisioning skipped');
    return 'skipped';
  }

  const tokenService = app.service('admin::api-token');
  const tokenRepository = app.db.query('admin::api-token');
  const existing = await tokenRepository.findOne({ where: { name: TOKEN_NAME } });
  const data = {
    name: TOKEN_NAME,
    description: 'Read-only token used by the SimplicityVibe backend',
    type: 'read-only',
    accessKey: tokenService.hash(accessKey),
    encryptedKey: null,
    lifespan: null,
    expiresAt: null,
  };

  if (existing) {
    if (existing.accessKey === data.accessKey && existing.type === data.type) {
      app.log.info('[deployment] backend API token already configured');
      return 'unchanged';
    }
    await tokenRepository.update({ where: { id: existing.id }, data });
    app.log.info('[deployment] backend API token rotated');
    return 'updated';
  }

  await tokenRepository.create({ data });
  app.log.info('[deployment] backend API token configured');
  return 'created';
}

async function findBy(app, uid, field, value) {
  return app.db.query(uid).findOne({ where: { [field]: value } });
}

async function ensureDocument(app, uid, uniqueField, data) {
  const existing = await findBy(app, uid, uniqueField, data[uniqueField]);
  if (existing) {
    return { entry: existing, result: 'already exists' };
  }

  const entry = await app.documents(uid).create({ data });
  return { entry, result: 'created' };
}

function getUploadFile(fileName) {
  const filePath = path.join(__dirname, '..', 'data', 'demo', 'uploads', fileName);
  const stats = fs.statSync(filePath);

  return {
    filepath: filePath,
    originalFileName: fileName,
    size: stats.size,
    mimetype: mime.lookup(fileName) || 'application/octet-stream',
  };
}

async function ensureUpload(app, fileName) {
  const displayName = path.parse(fileName).name;
  const existing = await app.db.query('plugin::upload.file').findOne({
    where: { name: displayName },
  });
  if (existing) {
    return existing;
  }

  const [uploaded] = await app.plugin('upload').service('upload').upload({
    files: getUploadFile(fileName),
    data: {
      fileInfo: {
        name: displayName,
        alternativeText: demoContent.covers[fileName].alternativeText,
        caption: demoContent.covers[fileName].caption,
      },
    },
  });
  return uploaded;
}

async function seedDemoContent(app) {
  const category = await ensureDocument(
    app,
    'api::category.category',
    'slug',
    demoContent.category
  );
  const author = await ensureDocument(app, 'api::author.author', 'email', demoContent.author);

  const tags = new Map();
  for (const tagData of demoContent.tags) {
    const tag = await ensureDocument(app, 'api::tag.tag', 'slug', tagData);
    tags.set(tagData.slug, tag.entry);
  }

  const results = [];
  for (const articleData of demoContent.articles) {
    const existing = await findBy(app, 'api::article.article', 'slug', articleData.slug);
    if (existing) {
      results.push({ slug: articleData.slug, result: 'already exists' });
      continue;
    }

    const cover = await ensureUpload(app, articleData.cover);
    await app.documents('api::article.article').create({
      status: 'published',
      data: {
        ...articleData,
        cover: cover.id,
        category: category.entry.documentId,
        author: author.entry.documentId,
        tags: articleData.tags.map((slug) => tags.get(slug).documentId),
      },
    });
    results.push({ slug: articleData.slug, result: 'created' });
  }

  return results;
}

async function run({
  enabled = isEnabled(process.env.STRAPI_DEMO_CONTENT_ENABLED),
  accessKey = process.env.STRAPI_API_TOKEN,
} = {}) {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  try {
    await ensureIntegrationToken(app, accessKey);

    if (!enabled) {
      app.log.info('[demo-seed] disabled; editorial content left unchanged');
      return [];
    }

    const results = await seedDemoContent(app);
    for (const { slug, result } of results) {
      app.log.info(`[demo-seed] ${slug}: ${result}`);
    }
    return results;
  } finally {
    await app.destroy();
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[demo-seed] failed');
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  ensureIntegrationToken,
  isEnabled,
  run,
  seedDemoContent,
};
