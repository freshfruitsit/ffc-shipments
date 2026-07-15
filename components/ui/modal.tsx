"use client";

import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(20,30,26,0.45)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-[520px] max-w-[92vw] overflow-y-auto rounded-lg bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-[18px] py-4">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-muted transition hover:text-ink">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="p-[18px]">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border px-[18px] py-3.5">{footer}</div>
      </div>
    </div>
  );
}
