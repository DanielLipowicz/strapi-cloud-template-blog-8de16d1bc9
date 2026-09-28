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

### Demo seed data

The explicit deployment seed creates two published Polish automotive articles, their category, tags, author, and cover images. It uses stable slugs, so repeated runs do not create duplicates or overwrite editorial changes. Set `STRAPI_DEMO_CONTENT_ENABLED=true` to enable the articles and provide `STRAPI_API_TOKEN` to provision the backend's read-only token.

```bash
STRAPI_DEMO_CONTENT_ENABLED=true STRAPI_API_TOKEN=change-me npm run seed:demo
```

The Docker Compose configurations run this command as a one-off service before Strapi starts. Keep `STRAPI_DEMO_CONTENT_ENABLED=false` in editorial production environments.

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

Deleting either Docker volume deletes the corresponding local data. Rebuilding or replacing the container does not delete the named volumes.

## Managing content and data

### Editorial work

Editors use `http://localhost:1337/admin` locally, or the protected production admin hostname, and manage content through **Content Manager** and **Media Library**.

Recommended publication flow:

1. Create or update an Article and keep it as a draft.
2. Complete the category, tags, persona, sources, cover, and article blocks.
3. Have a user with publishing responsibility verify the entry.
4. Publish it. The SimplicityVibe backend reads only published entries and the lifecycle hook notifies its metadata read model.
5. Use unpublish when content should disappear temporarily; reserve delete for content that should be removed permanently.

Recommended responsibility split:

- **CMS administrator:** content models, admin users, roles, tokens, and system settings.
- **Editor:** content and media without system or token administration.
- **Publisher:** publish and unpublish after editorial verification.
- **Backend integration:** custom read-only API token with only the required `find` and `findOne` permissions.

### What belongs in Git

Commit content-type schemas, components, controllers, lifecycle hooks, and configuration. Do not commit production databases, production articles, uploaded files, `.env` files, API tokens, or export archives.

Develop and review schema changes locally, then test them against a restored production-like database before production deployment. Application deployment must never reset or re-seed production editorial content.

### Environment policy

- **Local:** SQLite and named Docker volumes are appropriate. Example seed data is allowed.
- **Staging:** use a dedicated PostgreSQL database and a dedicated media bucket/storage location.
- **Production:** use PostgreSQL plus durable object storage or a backed-up persistent storage service. Do not share databases or media buckets between environments.

Seed scripts are for local examples and deterministic reference data only. Normal editorial content is created in the target environment through the admin panel rather than promoted through Git.

### Export and import

Strapi export creates a portable snapshot containing content, relations, schemas, configuration, and—unless excluded—media. It does not include administrator users or API tokens.

Example encrypted export from the local Docker service:

```bash
docker compose exec strapi npm run strapi -- export --file /app/.tmp/strapi-backup
docker compose cp strapi:/app/.tmp/strapi-backup.tar.gz.enc ./strapi-backup.tar.gz.enc
```

The first command interactively asks for an encryption key, avoiding a secret in shell history. Store that key separately from the archive. Copy the generated archive out of the container/volume and store it outside the Docker host. Do not commit it to Git. For production, prefer automated native PostgreSQL backups and media bucket backup/versioning; treat Strapi export as an additional portable snapshot, especially before upgrades or schema changes.

> **Destructive operation:** `strapi import` clears existing destination data and uploads before restoring and requires matching schemas. Take a fresh destination backup, isolate its media storage, and prove the import on staging before using it in production.

See the official [data export](https://docs.strapi.io/cms/features/data-management/export), [data import](https://docs.strapi.io/cms/features/data-management/import), and [data transfer](https://docs.strapi.io/cms/features/data-management/transfer) documentation.

### Production recovery baseline

- Back up PostgreSQL and media storage on an automated schedule with defined retention.
- Keep backups encrypted and outside the runtime host.
- Store secrets, administrator recovery, and API-token recreation procedures separately from data exports.
- Regularly restore into a clean environment and verify admin login, published Content API reads, media, and webhook delivery.
- Define an owner, RPO, RTO, monitoring, and escalation path before production launch.

The architectural policy is documented in [Strapi as CMS for Knowledge Hub](../docs/architecture/strapi-knowledge-hub-cms.md); production implementation is tracked in [BL-003e](../docs/features/backlog/BL-003e-strapi-production-readiness.md).

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

SQLite is a local-development choice. The production baseline is a dedicated PostgreSQL database with a least-privilege user; production media must not rely on the container filesystem.

## References

- [IMPL-13 – implemented spec (BL-003a)](../docs/features/implemented/IMPL-13-BL-003a-knowledge-hub-strapi-cms.md)
- [IMPL-15 – backend proxy & webhook (BL-003b)](../docs/features/implemented/IMPL-15-BL-003b-knowledge-hub-backend-proxy-metadata.md)
- [Strapi docs](https://docs.strapi.io/)
- [Architecture – Strapi Knowledge Hub CMS](../docs/architecture/strapi-knowledge-hub-cms.md)

---

*SimplicityVibe proprietary software.*
