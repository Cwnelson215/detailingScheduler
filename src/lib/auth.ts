import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getNextAuthSecret } from "./env";
import { clientIpFromHeaders, rateLimit } from "./rate-limit";
import { logger } from "./logger";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.password) return null;

        // Throttle by client IP to make the single-password login non-brute-forceable.
        // Returning null (rather than throwing) keeps the response indistinguishable
        // from a wrong password, so it leaks no "you hit the limit" oracle.
        const ip = clientIpFromHeaders((name) => {
          const v = req?.headers?.[name];
          return Array.isArray(v) ? v[0] : v;
        });
        if (!rateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
          logger.warn("login rate limit exceeded", { ip });
          return null;
        }

        const result = await db
          .select()
          .from(adminSettings)
          .where(eq(adminSettings.key, "admin_password_hash"));

        if (result.length === 0) return null;

        const valid = await bcrypt.compare(credentials.password, result[0].value);
        if (!valid) return null;

        return { id: "admin", name: "Admin" };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/admin/login",
  },
  secret: getNextAuthSecret(),
};
