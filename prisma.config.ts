import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Prisma 7: the connection URL moved here from schema.prisma. Only set it
  // when present so `prisma generate` (postinstall) works without a database.
  datasource: process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : undefined,
  migrations: {
    path: 'prisma/migrations',
  },
});
