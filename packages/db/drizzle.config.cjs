require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
  override: true,
});

/** @type {import("drizzle-kit").Config} */
module.exports = {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://127.0.0.1:5432/recovery_engine_placeholder",
  },
  // strict: pede confirmação no `drizzle-kit push`. Para `npm run dev` sem menu interativo: DRIZZLE_PUSH_STRICT=0 no .env
  strict: process.env.DRIZZLE_PUSH_STRICT !== "0",
};
