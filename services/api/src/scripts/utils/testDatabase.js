import env from "../../config/env.js";

export const getTestDatabaseUri = () => {
  if (env.nodeEnv !== "test") {
    throw new Error(
      "This script is restricted to NODE_ENV=test. No database connection was opened."
    );
  }

  return env.mongoUri;
};
