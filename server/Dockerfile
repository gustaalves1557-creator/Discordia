FROM node:24-alpine

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
# dummy só p/ o generate no build (o valor real vem do ambiente no deploy)
ARG DATABASE_URL=postgresql://user:pass@localhost:5432/discordia?schema=public
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY server/src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
