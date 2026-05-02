import app from "./app";
import { logger } from "./lib/logger";
import { seedSuperAdmin } from "./lib/seedAdmin";
import { seedDefaultInventoryLocation } from "./lib/seedInventoryLocations";
import { seedDefaultCarriers } from "./lib/seedCarriers";
import { seedDefaultSettings } from "./lib/seedSettings";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  try {
    await seedSuperAdmin();
  } catch (err) {
    logger.error({ err }, "Admin seed failed (continuing boot)");
  }

  try {
    await seedDefaultInventoryLocation();
  } catch (err) {
    logger.error(
      { err },
      "Default inventory location seed failed (continuing boot)",
    );
  }

  try {
    await seedDefaultCarriers();
  } catch (err) {
    logger.error(
      { err },
      "Default carriers seed failed (continuing boot)",
    );
  }

  try {
    await seedDefaultSettings();
  } catch (err) {
    logger.error(
      { err },
      "Default settings seed failed (continuing boot)",
    );
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
