import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function buildInitialQueue() {
  return {
    updatedAt: null,
    items: []
  };
}

async function safeReadJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return buildInitialQueue();
    }

    throw error;
  }
}

export function createReviewQueueRepository({
  outputFile = path.resolve("output", "review-queue.json"),
  now = () => new Date().toISOString(),
  store = null,
  stateKey = "review_queue"
} = {}) {
  async function readQueue() {
    if (store) {
      try {
        const queue = await store.read(stateKey, buildInitialQueue());
        return {
          updatedAt: queue.updatedAt ?? null,
          items: Array.isArray(queue.items) ? queue.items : []
        };
      } catch {}
    }

    const queue = await safeReadJson(outputFile);
    return {
      updatedAt: queue.updatedAt ?? null,
      items: Array.isArray(queue.items) ? queue.items : []
    };
  }

  async function writeQueue(queue) {
    if (store) {
      try {
        return await store.write(stateKey, queue);
      } catch {}
    }

    await mkdir(path.dirname(outputFile), { recursive: true });
    await writeFile(outputFile, JSON.stringify(queue, null, 2));
    return queue;
  }

  return {
    async list() {
      return readQueue();
    },
    async clear() {
      return writeQueue({
        updatedAt: now(),
        items: []
      });
    },
    async upsertBatch(batch) {
      const queue = await readQueue();
      const nextItems = [...queue.items];

      for (const draft of batch.drafts) {
        const existingIndex = nextItems.findIndex((item) => (
          item.id === draft.id ||
          (
            item.sourceLink === draft.sourceLink &&
            String(item.format || "") === String(draft.format || "")
          )
        ));
        const nextDraft = {
          ...draft,
          updatedAt: now(),
          lastBatchAt: batch.generatedAt,
          reviewDecision: "pending",
          reviewNotes: ""
        };

        if (existingIndex >= 0) {
          const previous = nextItems[existingIndex];
          nextItems[existingIndex] = {
            ...previous,
            ...nextDraft,
            reviewDecision: previous.reviewDecision || "pending",
            reviewNotes: previous.reviewNotes || ""
          };
          continue;
        }

        nextItems.unshift(nextDraft);
      }

      return writeQueue({
        updatedAt: now(),
        items: nextItems
      });
    },
    async decide(id, decision, notes = "") {
      const queue = await readQueue();
      const nextItems = queue.items.map((item) => (
        item.id === id
          ? {
              ...item,
              reviewDecision: decision,
              reviewNotes: notes,
              updatedAt: now()
            }
          : item
      ));

      return writeQueue({
        updatedAt: now(),
        items: nextItems
      });
    },
    async mergeExternalReviews(reviews) {
      const queue = await readQueue();
      const reviewMap = new Map(
        reviews
          .filter((review) => review?.id)
          .map((review) => [review.id, review])
      );
      let changed = false;

      const nextItems = queue.items.map((item) => {
        const externalReview = reviewMap.get(item.id);

        if (!externalReview) {
          return item;
        }

        const nextDecision = externalReview.reviewDecision || item.reviewDecision || "pending";
        const nextNotes = externalReview.reviewNotes ?? item.reviewNotes ?? "";

        if (nextDecision === item.reviewDecision && nextNotes === item.reviewNotes) {
          return item;
        }

        changed = true;

        return {
          ...item,
          reviewDecision: nextDecision,
          reviewNotes: nextNotes,
          updatedAt: now()
        };
      });

      if (!changed) {
        return queue;
      }

      return writeQueue({
        updatedAt: now(),
        items: nextItems
      });
    }
  };
}
