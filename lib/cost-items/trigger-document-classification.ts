"use client";

import type { CostItemDocumentKind } from "@/lib/cost-items/classification-service";

type TriggerDocumentClassificationOptions = {
  documentKind: CostItemDocumentKind;
  documentId: string;
  keepalive?: boolean;
};

const pendingDocumentClassificationKeys = new Set<string>();

function buildPendingKey(documentKind: CostItemDocumentKind, documentId: string) {
  return `${documentKind}:${documentId}`;
}

export function triggerDocumentClassification(options: TriggerDocumentClassificationOptions) {
  const documentId = options.documentId.trim();
  if (documentId.length === 0) {
    return;
  }

  const pendingKey = buildPendingKey(options.documentKind, documentId);
  if (pendingDocumentClassificationKeys.has(pendingKey)) {
    return;
  }

  pendingDocumentClassificationKeys.add(pendingKey);

  void fetch("/api/cost-items/classify-document", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      documentKind: options.documentKind,
      documentId,
    }),
    keepalive: options.keepalive === true,
  })
    .catch((error) => {
      console.error("Automatic document classification failed.", error);
    })
    .finally(() => {
      pendingDocumentClassificationKeys.delete(pendingKey);
    });
}
