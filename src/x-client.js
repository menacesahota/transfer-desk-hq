import { TwitterApi } from "twitter-api-v2";
import "dotenv/config";

export function hasXCredentials() {
  return Boolean(
    process.env.X_API_KEY &&
      process.env.X_API_SECRET &&
      process.env.X_ACCESS_TOKEN &&
      process.env.X_ACCESS_SECRET
  );
}

export function hasBearer() {
  return Boolean(process.env.X_BEARER_TOKEN);
}

/** User-context client (needed to post as @TransferDeskHQ). */
export function getUserClient() {
  if (!hasXCredentials()) {
    throw new Error(
      "Missing X OAuth credentials. Copy .env.example → .env and paste keys from the Developer Portal."
    );
  }
  return new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_SECRET,
  });
}

/** App-only client (better for reading public timelines when bearer is set). */
export function getAppClient() {
  if (hasBearer()) {
    return new TwitterApi(process.env.X_BEARER_TOKEN);
  }
  return getUserClient();
}
