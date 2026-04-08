import fs from "node:fs/promises";
import path from "node:path";

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

export function buildActivatedAgentName(squadId, agentFilename) {
  return `aios-${squadId}--${agentFilename.replace(/\.md$/i, "")}.md`;
}

export function buildActivatedAgentContent({ squadId, sourceRelativePath, originalContent }) {
  return [
    "<!-- AIOS ACTIVATED AGENT: generated file -->",
    `<!-- Squad: ${squadId} -->`,
    `<!-- Source: ${sourceRelativePath} -->`,
    "<!-- Refresh with: npm run agents:activate -->",
    "",
    originalContent.trim(),
    ""
  ].join("\n");
}

async function readSquadDirectories(squadsRoot) {
  const entries = await fs.readdir(squadsRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .sort();
}

export async function activateSquads({ squadsRoot, targetRoot }) {
  const squadIds = await readSquadDirectories(squadsRoot);
  const agentsRoot = path.join(targetRoot, "agents");
  await fs.mkdir(agentsRoot, { recursive: true });

  const activatedAgents = [];

  for (const squadId of squadIds) {
    const sourceAgentsRoot = path.join(squadsRoot, squadId, "agents");
    let sourceAgentFiles = [];

    try {
      sourceAgentFiles = (await fs.readdir(sourceAgentsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort();
    } catch {
      continue;
    }

    for (const agentFilename of sourceAgentFiles) {
      const sourcePath = path.join(sourceAgentsRoot, agentFilename);
      const originalContent = await fs.readFile(sourcePath, "utf8");
      const activatedName = buildActivatedAgentName(squadId, agentFilename);
      const targetPath = path.join(agentsRoot, activatedName);
      const sourceRelativePath = toPosixPath(path.relative(targetRoot, sourcePath));
      const activatedContent = buildActivatedAgentContent({
        squadId,
        sourceRelativePath,
        originalContent
      });

      await fs.writeFile(targetPath, activatedContent, "utf8");
      activatedAgents.push({
        squadId,
        agentId: agentFilename.replace(/\.md$/i, ""),
        activatedName,
        sourceRelativePath
      });
    }
  }

  const registry = {
    generatedAt: new Date().toISOString(),
    totalSquads: [...new Set(activatedAgents.map((agent) => agent.squadId))].length,
    totalAgents: activatedAgents.length,
    squads: [...new Set(activatedAgents.map((agent) => agent.squadId))],
    agents: activatedAgents
  };

  await fs.writeFile(
    path.join(targetRoot, "agents-registry.json"),
    JSON.stringify(registry, null, 2),
    "utf8"
  );

  const readmeLines = [
    "# AIOS Agents Activated",
    "",
    "Esses agentes foram gerados automaticamente a partir da pasta `../squads`.",
    "",
    `Total de squads: ${registry.totalSquads}`,
    `Total de agentes: ${registry.totalAgents}`,
    "",
    "## Como atualizar",
    "",
    "```bash",
    "npm run agents:activate",
    "```",
    "",
    "## Agentes ativados",
    ""
  ];

  for (const squadId of registry.squads) {
    readmeLines.push(`### ${squadId}`);

    for (const agent of activatedAgents.filter((entry) => entry.squadId === squadId)) {
      readmeLines.push(`- \`${agent.activatedName.replace(/\.md$/i, "")}\` <- \`${agent.agentId}\``);
    }

    readmeLines.push("");
  }

  await fs.writeFile(path.join(targetRoot, "README.md"), `${readmeLines.join("\n").trim()}\n`, "utf8");

  return registry;
}
