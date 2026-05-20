import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getNextAuthSecret } from "./env";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin Login",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) return null;

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
