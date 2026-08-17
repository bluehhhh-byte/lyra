import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadSourceDeployment } from "./vercel-source-deploy.js";

const cfg = {
  token: "vercel-token",
  teamId: "team_123",
  name: "lyra",
  org: "bluehhhh-byte",
  repo: "lyra",
  ref: "main",
};
const commit = {
  sha: "a".repeat(40),
  message: "latest song",
  authorName: "Lyra",
  authorEmail: "lyra@example.com",
};

let received;
async function deployer(options) {
  received = options;
  return { id: "dpl_mobile", url: "lyra-mobile.vercel.app", readyState: "BUILDING" };
}

const result = await uploadSourceDeployment({ cfg, sourceDir: "/tmp/source", commit, deployer });
assert.equal(result.id, "dpl_mobile");
assert.equal(received.cfg.name, "lyra");
assert.equal(received.cfg.teamId, "team_123");
assert.equal(received.cfg.token, "vercel-token");
assert.equal(received.commit.sha, commit.sha);

await assert.rejects(
  () =>
    uploadSourceDeployment({
      cfg,
      sourceDir: "/tmp/source",
      commit,
      deployer: async function () {
        throw new Error("upload failed");
      },
    }),
  /upload failed/
);

const sourceDir = await mkdtemp(path.join(tmpdir(), "lyra-upload-test-"));
try {
  await writeFile(path.join(sourceDir, "index.txt"), "Lyra");
  const calls = [];
  let createCount = 0;
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/v13/deployments")) {
      createCount += 1;
      const file = JSON.parse(init.body).files[0];
      if (createCount === 1) {
        return Response.json(
          { error: { code: "missing_files", message: "upload files", missing: [file.sha] } },
          { status: 400 }
        );
      }
      return Response.json({ id: "dpl_direct", url: "lyra.vercel.app", readyState: "BUILDING" });
    }
    return Response.json({});
  };
  const direct = await uploadSourceDeployment({ cfg, sourceDir, commit, fetcher });
  assert.equal(direct.id, "dpl_direct");
  assert.equal(calls.filter((call) => call.url.includes("/v13/deployments")).length, 2);
  const upload = calls.find((call) => call.url.includes("/v2/files"));
  assert.equal(upload.init.headers["Content-Type"], "application/octet-stream");
  assert.equal(upload.init.body.toString(), "Lyra");
} finally {
  await rm(sourceDir, { recursive: true, force: true });
}

console.log("all passed");
