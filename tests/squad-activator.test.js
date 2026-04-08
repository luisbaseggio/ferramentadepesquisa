import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  activateSquads,
  buildActivatedAgentContent,
  buildActivatedAgentName
} from "../src/squad-activator.js";

test("buildActivatedAgentName namespaces agents by squad", () => {
  assert.equal(
    buildActivatedAgentName("copy-squad", "copy-chief.md"),
    "aios-copy-squad--copy-chief.md"
  );
});

test("buildActivatedAgentContent keeps source attribution", () => {
  const content = buildActivatedAgentContent({
    squadId: "copy-squad",
    sourceRelativePath: "../squads/copy-squad/agents/copy-chief.md",
    originalContent: "# Copy Chief"
  });

  assert.match(content, /AIOS ACTIVATED AGENT/);
  assert.match(content, /Source: \.\.\/squads\/copy-squad\/agents\/copy-chief\.md/);
  assert.match(content, /# Copy Chief/);
});

test("activateSquads writes activated agents and registry", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "squad-activator-"));
  const squadsRoot = path.join(tempRoot, "squads");
  const targetRoot = path.join(tempRoot, ".claude");

  await fs.mkdir(path.join(squadsRoot, "copy-squad", "agents"), { recursive: true });
  await fs.mkdir(path.join(squadsRoot, "design-squad", "agents"), { recursive: true });
  await fs.writeFile(path.join(squadsRoot, "copy-squad", "agents", "copy-chief.md"), "# Copy Chief\n");
  await fs.writeFile(path.join(squadsRoot, "design-squad", "agents", "design-chief.md"), "# Design Chief\n");

  const registry = await activateSquads({ squadsRoot, targetRoot });

  assert.equal(registry.totalSquads, 2);
  assert.equal(registry.totalAgents, 2);

  const activatedAgent = await fs.readFile(
    path.join(targetRoot, "agents", "aios-copy-squad--copy-chief.md"),
    "utf8"
  );
  const savedRegistry = JSON.parse(await fs.readFile(path.join(targetRoot, "agents-registry.json"), "utf8"));
  const readme = await fs.readFile(path.join(targetRoot, "README.md"), "utf8");

  assert.match(activatedAgent, /# Copy Chief/);
  assert.equal(savedRegistry.totalAgents, 2);
  assert.match(readme, /aios-copy-squad--copy-chief/);
});
