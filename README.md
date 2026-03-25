# SimplicityVibe – Knowledge Hub CMS (Strapi)

Headless CMS for the **Knowledge Hub** feature ([IMPL-13 BL-003a](../docs/features/implemented/IMPL-13-BL-003a-knowledge-hub-strapi-cms.md)). Editors manage articles here; **SimplicityVibe backend** consumes the Content API (with an API token) and exposes a proxy API to the frontend.

## Prerequisites

- **Node.js** 18–22 ([`package.json` engines](./package.json))
- **npm** 6+

## Quick start (local)

1. Copy environment file and set secrets:

   ```bash
   cp .env.example .env
   ```

   Generate strong values for `APP_KEYS` (comma-separated), `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, `TRANSFER_TOKEN_SALT`.

2. Install and run the admin + API in development mode:

   ```bash
   npm ci
   npm run develop
   ```

3. Open **Admin**: `http://localhost:1337/admin` — create the first admin user when prompted.

4. **API token (required for backend / no public Content API)**  
   Settings → **API Tokens** → Create token (e.g. *Read-only* or custom with `find` / `findOne` on Article, Category, Author, Tag, Persona).  
   Store the token in the Spring app as `STRAPI_API_TOKEN` (see BL-003b).

5. **Optional – outbound webhooks to your backend** (read model / BL-003b):

   ```env
   KNOWLEDGE_HUB_WEBHOOK_URL=https://your-backend.example.com/api/v1/internal/knowledge/strapi-webhook
   KNOWLEDGE_HUB_WEBHOOK_SECRET=shared-secret-for-X-Webhook-Secret-header
   ```

   On article create/update/delete, Strapi `POST`s a JSON payload (see below). If unset, no HTTP calls are made.

### Troubleshooting: articles in Strapi but empty on SimplicityVibe frontend

1. **Publish drafts** — Draft & Publish is enabled on Article. Only **published** entries are returned by the Content API (`status=published`). In the admin, use **Publish** for each article.
2. **Backend env** — Spring needs `STRAPI_URL` (e.g. `http://localhost:1337`) and `STRAPI_API_TOKEN`. Without them the API returns **503** (`cms_unavailable`) to the app.
3. **API token permissions** — The token must allow `find` / `findOne` on **Article** (and populated relations: Category, Tag, etc.).
4. **Logged in** — The React app calls `/knowledge/articles` with JWT; open **Knowledge Hub** after login.
5. **Strapi 5** — The Spring proxy uses `status=published` (not the old v4 `publicationState=live`).

### First-time seed data

On the **first** successful bootstrap, `src/bootstrap.js` imports `data/data.json` (categories, personas, tags, authors, articles).  
To re-seed, delete the SQLite DB (default: `.tmp/data.db`) and the Strapi store flag, or use a fresh database.

```bash
npm run seed:example
```

This boots Strapi once; bootstrap runs automatically during `load()` (same as `develop` / `start`).

## Docker

From this directory:

```bash
docker compose up --build
```

From monorepo root:

```bash
docker compose -f strapi-cloud-template-blog/docker-compose.yml up --build
```

Override secrets via environment (see `docker-compose.yml`). Persisted volumes: SQLite under `/app/.tmp`, uploads under `/app/public/uploads`.

## Content model (Knowledge Hub)

| Type       | Purpose |
|-----------|---------|
| **Article** | Title, slug, **lead**, **blocks** (rich body), cover, author, category, **tags**, **persona**, **sources**; editorial: **featured**, **editorialPriority**, **manualRelatedArticles** / inverse, **promotedForLocale**, **campaignTag**, **excludeFromRecommendations**. Draft & publish. |
| **Category** | name, slug, description, articles |
| **Tag** | name, slug, articles (many-to-many) |
| **Persona** | name, slug, description, articles (editorial targeting) |
| **Author** | name, email, avatar, articles |

### REST API (examples)

All require **`Authorization: Bearer <API_TOKEN>`** (Public role has **no** access to these types).

- List published articles:  
  `GET /api/articles?status=published&populate=*`
- By slug:  
  `GET /api/articles?filters[slug][$eq]=my-slug&status=published`
- Query params (Strapi 5): `fields`, `filters`, `sort`, `pagination`, `populate`, `status` (draft/published).  
  **Locale:** enable the i18n plugin when you need localized entries; then use `locale` in queries.

## Webhooks (BL-003b integration)

### A) Lifecycle HTTP hook (code)

If `KNOWLEDGE_HUB_WEBHOOK_URL` is set, `src/api/article/content-types/article/lifecycles.js` sends:

```http
POST <KNOWLEDGE_HUB_WEBHOOK_URL>
Content-Type: application/json
X-Webhook-Secret: <KNOWLEDGE_HUB_WEBHOOK_SECRET>   # if set
```

**SimplicityVibe backend path (default context `/api/v1`):** set `KNOWLEDGE_HUB_WEBHOOK_URL` to e.g. `http://host.docker.internal:8080/api/v1/internal/knowledge/strapi-webhook` (or `http://localhost:8080/...` when Strapi runs on the host). Match `KNOWLEDGE_HUB_WEBHOOK_SECRET` with backend `KNOWLEDGE_HUB_WEBHOOK_SECRET`.

Example body:

```json
{
  "source": "strapi",
  "event": "entry.update",
  "model": "article",
  "timestamp": "2025-03-19T12:00:00.000Z",
  "data": {
    "documentId": "...",
    "id": 1,
    "slug": "my-article",
    "publishedAt": "2025-03-19T10:00:00.000Z",
    "locale": null
  }
}
```

Events: `entry.create`, `entry.update`, `entry.delete`. Publishing/unpublishing typically appears as `entry.update`.

### B) Admin UI webhooks (optional)

Settings → **Webhooks** — you can add Strapi-managed webhooks for the same lifecycle (redundant with A or for other targets).

## TypeScript types

After schema changes:

```bash
# PowerShell example
$env:ADMIN_JWT_SECRET="local"; $env:API_TOKEN_SALT="local"; $env:APP_KEYS="a,b,c,d"; $env:JWT_SECRET="local"; $env:TRANSFER_TOKEN_SALT="local"
npx strapi ts:generate-types
```

## Production database

`config/database.js` supports `sqlite` (default), `postgres`, and `mysql` via `DATABASE_CLIENT` and related env vars.

## References

- [IMPL-13 – implemented spec (BL-003a)](../docs/features/implemented/IMPL-13-BL-003a-knowledge-hub-strapi-cms.md)
- [IMPL-15 – backend proxy & webhook (BL-003b)](../docs/features/implemented/IMPL-15-BL-003b-knowledge-hub-backend-proxy-metadata.md)
- [Strapi docs](https://docs.strapi.io/)
- [Architecture – Strapi Knowledge Hub CMS](../docs/architecture/strapi-knowledge-hub-cms.md)

---

*SimplicityVibe proprietary software.*
