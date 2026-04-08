import path from "node:path";
import { activateSquads } from "./squad-activator.js";

const projectRoot = process.cwd();
const workspaceRoot = path.resolve(projectRoot, "..");
const squadsRoot = path.join(workspaceRoot, "squads");
const targetRoot = path.join(projectRoot, ".claude");

const registry = await activateSquads({
  squadsRoot,
  targetRoot
});

console.log(JSON.stringify({
  message: "AIOS agents activated successfully.",
  targetRoot,
  totalSquads: registry.totalSquads,
  totalAgents: registry.totalAgents
}, null, 2));
