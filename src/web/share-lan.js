import os from "node:os";

function findLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      addresses.push(entry.address);
    }
  }

  return [...new Set(addresses)];
}

const addresses = findLanAddresses();

if (addresses.length === 0) {
  console.log("Nao encontrei um IP local para compartilhar na rede.");
  process.exit(0);
}

console.log("Links da rede local para abrir o estúdio:");

for (const address of addresses) {
  console.log(`- http://${address}:4173/`);
}
