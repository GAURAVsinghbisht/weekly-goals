
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";

export default function ConfirmDialog({ open, title, description, confirmText = "Delete", cancelText = "Cancel", onConfirm, onCancel }: { open: boolean; title: string; description?: string; confirmText?: string; cancelText?: string; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} className="relative mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 bg-gradient-to-r from-rose-600 to-pink-500 px-4 py-3 text-white">
              <div className="rounded-xl bg-white/20 p-2"><Trash2 className="h-5 w-5"/></div>
              <div className="text-sm font-semibold">{title}</div>
            </div>
            <div className="p-4 text-sm text-neutral-700">
              {description && <p>{description}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 bg-neutral-50 px-4 py-3">
              <button onClick={onCancel} className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100">{cancelText}</button>
              <button onClick={onConfirm} className="rounded-xl bg-rose-600 px-3 py-2 text-sm text-white shadow hover:bg-rose-700">{confirmText}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
