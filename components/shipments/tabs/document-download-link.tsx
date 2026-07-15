"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { getSignedDownloadUrlAction } from "@/lib/actions/documents";

export function DocumentDownloadLink({ storagePath }: { storagePath: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const result = await getSignedDownloadUrlAction(storagePath);
    setLoading(false);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Download
    </button>
  );
}
