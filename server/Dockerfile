FROM node:24-alpine

WORKDIR /app/server

COPY server/package*.json ./
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
# dummy só p/ o generate no build (o valor real vem do ambiente no deploy)
ARG DATABASE_URL=postgresql://user:pass@localhost:5432/discordia?schema=public
ENV DATABASE_URL=$DATABASE_URL
# o postinstall do npm ci já roda `prisma generate` com o schema presente
RUN npm ci --omit=dev

COPY server/src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
