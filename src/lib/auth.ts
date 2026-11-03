import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
// Relative import on purpose: the Better Auth CLI doesn't understand the "@/" alias.
import { db } from "../db/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
  },
  // Must stay last in the list. Lets login cookies work from server code.
  plugins: [nextCookies()],
});