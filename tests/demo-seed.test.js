'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ensureIntegrationToken,
  isEnabled,
  seedDemoContent,
} = require('../scripts/seed');

function createApp() {
  const records = new Map();
  const collection = (uid) => {
    if (!records.has(uid)) records.set(uid, []);
    return records.get(uid);
  };
  let id = 0;

  const app = {
    records,
    log: { info() {} },
    db: {
      query(uid) {
        return {
          async findOne({ where }) {
            return collection(uid).find((entry) =>
              Object.entries(where).every(([field, value]) => entry[field] === value)
            );
          },
          async create({ data }) {
            const entry = { id: ++id, ...data };
            collection(uid).push(entry);
            return entry;
          },
          async update({ where, data }) {
            const entry = collection(uid).find((item) => item.id === where.id);
            Object.assign(entry, data);
            return entry;
          },
        };
      },
    },
    documents(uid) {
      return {
        async create({ data, status }) {
          const entry = { id: ++id, documentId: `document-${id}`, status, ...data };
          collection(uid).push(entry);
          return entry;
        },
      };
    },
    plugin() {
      return {
        service() {
          return {
            async upload({ data }) {
              const entry = { id: ++id, name: data.fileInfo.name, ...data.fileInfo };
              collection('plugin::upload.file').push(entry);
              return [entry];
            },
          };
        },
      };
    },
    service() {
      return { hash: (value) => `hash:${value}` };
    },
  };

  return app;
}

test('boolean flag accepts explicit enabled values only', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) assert.equal(isEnabled(value), true);
  for (const value of [undefined, '', '0', 'false', 'disabled']) assert.equal(isEnabled(value), false);
});

test('demo seed creates two published articles and is idempotent', async () => {
  const app = createApp();

  const first = await seedDemoContent(app);
  assert.deepEqual(first.map(({ result }) => result), ['created', 'created']);

  const articles = app.records.get('api::article.article');
  assert.equal(articles.length, 2);
  assert.ok(articles.every(({ status }) => status === 'published'));
  assert.deepEqual(
    articles.map(({ slug }) => slug),
    ['kiedy-wymienic-olej-silnikowy', 'sezonowa-wymiana-i-dobor-opon']
  );
  assert.equal(app.records.get('plugin::upload.file').length, 2);
  assert.equal(articles[0].tags.length, 1);
  assert.equal(articles[1].tags.length, 2);

  articles[0].title = 'Treść zmieniona przez redaktora';
  const second = await seedDemoContent(app);
  assert.deepEqual(second.map(({ result }) => result), ['already exists', 'already exists']);
  assert.equal(articles.length, 2);
  assert.equal(articles[0].title, 'Treść zmieniona przez redaktora');
  assert.equal(app.records.get('plugin::upload.file').length, 2);
});

test('integration token is created idempotently and can be rotated', async () => {
  const app = createApp();

  assert.equal(await ensureIntegrationToken(app, 'first-token'), 'created');
  assert.equal(await ensureIntegrationToken(app, 'first-token'), 'unchanged');
  assert.equal(await ensureIntegrationToken(app, 'second-token'), 'updated');

  const tokens = app.records.get('admin::api-token');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].accessKey, 'hash:second-token');
  assert.equal(tokens[0].type, 'read-only');
});
