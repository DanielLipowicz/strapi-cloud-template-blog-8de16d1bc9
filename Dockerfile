# SimplicityVibe Knowledge Hub – Strapi CMS (BL-003a)
# Requires APP_KEYS, ADMIN_JWT_SECRET, API_TOKEN_SALT, JWT_SECRET, TRANSFER_TOKEN_SALT (see .env.example).

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

RUN npm run build

EXPOSE 1337
CMD ["npm", "run", "start"]
