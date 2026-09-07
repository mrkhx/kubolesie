#!/bin/sh
# Production container entrypoint.
# Render Free has no Pre-Deploy Command, so migrate deploy runs here
# before the API process. DATABASE_URL comes only from the environment
# and must never be printed. Redis is not used for migrations.
set -eu

echo '[container] prisma migrate deploy'
npm run db:migrate:deploy
echo '[container] migrations applied, starting API'
exec npm run start:api
