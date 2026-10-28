FROM node:20-alpine AS builder
WORKDIR /app
# Install pnpm
RUN npm i -g pnpm
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY prisma/package.json ./prisma/
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:api
# Production image
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/main.js"]
