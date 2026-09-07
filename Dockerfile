# Production image for the Kubolesie API (VK Callback interface + Game Core).
# Run migrations as a separate release step: `npm run db:migrate:deploy`.
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
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
CMD ["npm", "run", "start:api"]
