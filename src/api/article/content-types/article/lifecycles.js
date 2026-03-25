'use strict';

/**
 * Notifies SimplicityVibe backend (BL-003b) when article content changes.
 * Set KNOWLEDGE_HUB_WEBHOOK_URL to your backend endpoint; optional KNOWLEDGE_HUB_WEBHOOK_SECRET for HMAC-style verification.
 *
 * Events map to Strapi lifecycle hooks:
 * - entry.create → afterCreate
 * - entry.update → afterUpdate (includes publish / unpublish when draft & publish is enabled)
 * - entry.delete → afterDelete
 *
 * Admin UI webhooks (Settings → Webhooks) can be added in addition for redundancy.
 */

function buildPayload(eventType, result) {
  return {
    source: 'strapi',
    event: eventType,
    model: 'article',
    timestamp: new Date().toISOString(),
    data: result
      ? {
          documentId: result.documentId,
          id: result.id,
          slug: result.slug,
          publishedAt: result.publishedAt,
          locale: result.locale,
        }
      : {},
  };
}

async function postKnowledgeHubWebhook(eventType, result, app) {
  const url = process.env.KNOWLEDGE_HUB_WEBHOOK_URL;
  if (!url) {
    return;
  }

  const payload = buildPayload(eventType, result);
  const secret = process.env.KNOWLEDGE_HUB_WEBHOOK_SECRET;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) {
    headers['X-Webhook-Secret'] = secret;
  }

  const log = app?.log || console;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      log.warn(`[Knowledge Hub webhook] ${eventType}: target returned HTTP ${res.status}`);
    }
  } catch (err) {
    log.error(`[Knowledge Hub webhook] ${eventType}: request failed`);
    log.error(err);
  }
}

function getStrapiApp() {
  return typeof globalThis.strapi !== 'undefined' ? globalThis.strapi : null;
}

module.exports = {
  async afterCreate(event) {
    await postKnowledgeHubWebhook('entry.create', event.result, getStrapiApp());
  },

  async afterUpdate(event) {
    await postKnowledgeHubWebhook('entry.update', event.result, getStrapiApp());
  },

  async afterDelete(event) {
    await postKnowledgeHubWebhook('entry.delete', event.result, getStrapiApp());
  },
};
