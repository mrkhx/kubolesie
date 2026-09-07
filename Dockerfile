# Production image for the Kubolesie API (VK Callback interface + Game Core).
# Startup: prisma migrate deploy, then API. Render Free has no Pre-Deploy Command.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/start-container.sh ./scripts/start-container.sh
RUN npm ci
RUN npm run prisma:generate

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S kubolesie \
  && adduser -S kubolesie -G kubolesie
COPY --from=deps --chown=kubolesie:kubolesie /app /app
USER kubolesie
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["sh", "scripts/start-container.sh"]
