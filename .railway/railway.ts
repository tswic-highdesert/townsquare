import { defineRailway, project, service, volume } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "townsquare-live";
export default defineRailway(() => {
  const residentData = volume("townsquare-resident-data", { sizeMB: 1000, region: "us-east4-eqdc4a" });
  const townsquareLive = service("townsquare-live", {
    volumeMounts: { "/data": residentData },
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/healthz",
    healthcheckTimeout: 120,
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 3, drainingSeconds: 15, limitOverride: { containers: { cpu: 0.5, memoryBytes: 750000000 } }, overlapSeconds: 0 },
  });

  return project("River Valley Town Square", {
    variables: { managed: false },
    resources: [townsquareLive],
  });
});
