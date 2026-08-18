import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var richoPrisma: PrismaClient | undefined;
}

const prisma = global.richoPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.richoPrisma = prisma;
}

export default prisma;
