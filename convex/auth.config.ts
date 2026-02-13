import { getPrivyAppId } from "./env";

const privyAppId = getPrivyAppId();

export default {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: privyAppId,
      issuer: "privy.io",
      jwks: "https://auth.privy.io/api/v1/apps/" + privyAppId + "/jwks.json",
      algorithm: "ES256" as const,
    },
  ],
};
