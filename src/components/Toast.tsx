
import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

export default function Toast({ show, title, subtitle, onClose }: { show: boolean; title: string; subtitle?: string; onClose: () => void; }) {
  useEffect(() => { if (!show) return; const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [show, onClose]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-fuchsia-500 p-4 text-white shadow-2xl">
            <PartyPopper className="mt-0.5 h-6 w-6" />
            <div>
              <div className="text-sm font-semibold">{title}</div>
              {subtitle && <div className="text-xs opacity-90">{subtitle}</div>}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
