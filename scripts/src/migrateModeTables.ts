import { Client } from "pg";

const SKUS = ["134444F","134466F","134488F","1344110F","134444B","134466B","134488B","1344110B","134444BR","134466BR","134488BR","1344110BR","91006","006086"];

async function main() {
  const neon = new Client({ connectionString: process.env.PROD_DATABASE_URL_NEON || "" });
  // We'll actually get neon via env fallback below since we don't have separate var; use replit db tool instead.
}
