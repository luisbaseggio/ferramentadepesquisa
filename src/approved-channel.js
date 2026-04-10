import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildContentMachinePacket } from "./content-machine-packets.js";

function initialState() {
  return {
    updatedAt: null,
    items: []
  };
}

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return initialState();
    }

    throw error;
  }
}

export function createApprovedChannelRepository({
  outputFile = path.resolve("output", "approved-channel.json"),
  markdownDir = path.resolve("output", "approved-posts"),
  now = () => new Date().toISOString(),
  store = null,
  stateKey = "approved_channel"
} = {}) {
  async function readState() {
    if (store) {
      try {
        const state = await store.read(stateKey, initialState());
        return {
          updatedAt: state.updatedAt ?? null,
          items: Array.isArray(state.items) ? state.items : []
        };
      } catch {}
    }

    const state = await safeReadJson(outputFile);
    return {
      updatedAt: state.updatedAt ?? null,
      items: Array.isArray(state.items) ? state.items : []
    };
  }

  async function writeState(state) {
    if (store) {
      try {
        return await store.write(stateKey, state);
      } catch {}
    }

    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, JSON.stringify(state, null, 2));
    return state;
  }

  async function writeMarkdownFiles(items) {
    await rm(markdownDir, { recursive: true, force: true });
    await mkdir(markdownDir, { recursive: true });

    await Promise.all(items.map((item) => (
      writeFile(path.join(markdownDir, item.outputFileName), item.markdown)
    )));
  }

  return {
    async list() {
      return readState();
    },
    async clear() {
      const nextState = {
        updatedAt: now(),
        items: []
      };

      await writeMarkdownFiles([]);
      return writeState(nextState);
    },
    async syncFromReviewQueue(queue) {
      const currentState = await readState();
      const currentMap = new Map(currentState.items.map((item) => [item.id, item]));
      const approvedDrafts = (queue.items ?? [])
        .filter((item) => item.reviewDecision === "approved")
        .map((item) => {
          const previous = currentMap.get(item.id);

          return buildContentMachinePacket(item, {
            selectedHeadlineNumber: previous?.selectedHeadlineNumber || 1,
            selectedTemplate: previous?.selectedTemplate || 1,
            manualFinalRender: previous?.manualFinalRender || "",
            aiPrompt: previous?.aiPrompt || "",
            newsContext: previous?.newsContext || "",
            evaluationStatus: previous?.evaluationStatus || "pending",
            evaluationScore: previous?.evaluationScore || 0,
            evaluationNotes: previous?.evaluationNotes || ""
          });
        });

      const nextState = {
        updatedAt: now(),
        items: approvedDrafts
      };

      await writeMarkdownFiles(approvedDrafts);
      return writeState(nextState);
    },
    async updatePacket(id, updates = {}) {
      const state = await readState();
      const nextItems = state.items.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return buildContentMachinePacket(item.draftSnapshot, {
          selectedHeadlineNumber: updates.selectedHeadlineNumber ?? item.selectedHeadlineNumber,
          selectedTemplate: updates.selectedTemplate ?? item.selectedTemplate,
          manualFinalRender: updates.manualFinalRender ?? item.manualFinalRender ?? "",
          aiPrompt: updates.aiPrompt ?? item.aiPrompt,
          newsContext: updates.newsContext ?? item.newsContext ?? "",
          evaluationStatus: updates.evaluationStatus ?? item.evaluationStatus,
          evaluationScore: updates.evaluationScore ?? item.evaluationScore,
          evaluationNotes: updates.evaluationNotes ?? item.evaluationNotes
        });
      });

      const nextState = {
        updatedAt: now(),
        items: nextItems
      };

      await writeMarkdownFiles(nextItems);
      return writeState(nextState);
    }
  };
}
