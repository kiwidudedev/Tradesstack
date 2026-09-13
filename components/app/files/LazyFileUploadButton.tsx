"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentEntityContext, DocumentWorkspaceNode } from "@/lib/documents/workspace";

const FileUploadQueue = dynamic(
  () => import("@/components/app/files/FileUploadQueue").then((module) => module.FileUploadQueue),
  { ssr: false },
);

export function LazyFileUploadButton(props: {
  entity: DocumentEntityContext;
  parentNodeId: string | null;
  currentFolderName: string;
  visibleNodes: DocumentWorkspaceNode[];
  onComplete: () => void;
}) {
  const [activated, setActivated] = useState(false);

  if (!activated) {
    return (
      <Button size="toolbar" onClick={() => setActivated(true)}>
        <UploadCloud className="h-4 w-4" />
        Upload files
      </Button>
    );
  }

  return <FileUploadQueue {...props} defaultOpen />;
}
