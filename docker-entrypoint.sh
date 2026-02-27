#!/bin/sh
set -e

mkdir -p /app/data /app/public/uploads

npx prisma migrate deploy

exec npm run start
