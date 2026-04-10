import { deriveUpdatedAt, isMissingTableError } from "./supabase-relational.js";

const TABLE_NAME = "review_queue_items";

function buildInitialQueue() {
  return {
    updatedAt: null,
    items: []
  };
}

function normalizeQueueItem(row) {
  return {
    ...row.payload,
    reviewDecision: row.review_decision || "pending",
    reviewNotes: row.review_notes || "",
    updatedAt: row.updated_at || null,
    lastBatchAt: row.last_batch_at || null
  };
}

function toRow(item, workspaceId, nowValue) {
  return {
    id: item.id,
    workspace_id: workspaceId,
    source_link: item.sourceLink || null,
    format: item.format || null,
    review_decision: item.reviewDecision || "pending",
    review_notes: item.reviewNotes || "",
    last_batch_at: item.lastBatchAt || null,
    updated_at: item.updatedAt || nowValue,
    payload: item
  };
}

export function createSupabaseReviewQueueRepository({
  client,
  now = () => new Date().toISOString()
}) {
  if (!client) {
    throw new Error("Supabase client ausente para review queue.");
  }

  async function list(workspaceId) {
    if (!workspaceId) {
      return buildInitialQueue();
    }

    const { data, error } = await client
      .from(TABLE_NAME)
      .select("id, review_decision, review_notes, updated_at, last_batch_at, payload")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase review queue list failed: ${error.message}`);
    }

    const items = (data || []).map(normalizeQueueItem);
    return {
      updatedAt: deriveUpdatedAt(items),
      items
    };
  }

  async function clear(workspaceId) {
    if (!workspaceId) {
      return buildInitialQueue();
    }

    const { error } = await client
      .from(TABLE_NAME)
      .delete()
      .eq("workspace_id", workspaceId);

    if (error) {
      if (isMissingTableError(error)) {
        throw new Error("As tabelas relacionais do Supabase ainda nao foram criadas.");
      }

      throw new Error(`Supabase review queue clear failed: ${error.message}`);
    }

    return {
      updatedAt: now(),
      items: []
    };
  }

  async function upsertBatch(batch, workspaceId) {
    const queue = await list(workspaceId);
    const nextItems = [...queue.items];
    const nowValue = now();

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
        updatedAt: nowValue,
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

    const rows = nextItems.map((item) => toRow(item, workspaceId, nowValue));
    const { error } = await client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: "id" });

    if (error) {
      throw new Error(`Supabase review queue upsert failed: ${error.message}`);
    }

    return {
      updatedAt: nowValue,
      items: nextItems
    };
  }

  async function decide(id, decision, notes = "", workspaceId) {
    const queue = await list(workspaceId);
    const target = queue.items.find((item) => item.id === id);

    if (!target) {
      return queue;
    }

    const nowValue = now();
    const updatedItem = {
      ...target,
      reviewDecision: decision,
      reviewNotes: notes,
      updatedAt: nowValue
    };

    const { error: rewriteError } = await client
      .from(TABLE_NAME)
      .upsert([toRow(updatedItem, workspaceId, nowValue)], { onConflict: "id" });

    if (rewriteError) {
      throw new Error(`Supabase review queue decision failed: ${rewriteError.message}`);
    }

    return {
      updatedAt: nowValue,
      items: queue.items.map((item) => item.id === id ? updatedItem : item)
    };
  }

  async function mergeExternalReviews(reviews, workspaceId) {
    const queue = await list(workspaceId);
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

    const rows = nextItems.map((item) => toRow(item, workspaceId, item.updatedAt || now()));
    const { error } = await client
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: "id" });

    if (error) {
      throw new Error(`Supabase review queue merge failed: ${error.message}`);
    }

    return {
      updatedAt: deriveUpdatedAt(nextItems),
      items: nextItems
    };
  }

  return {
    list,
    clear,
    upsertBatch,
    decide,
    mergeExternalReviews
  };
}
