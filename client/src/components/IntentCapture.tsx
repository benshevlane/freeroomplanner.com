import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface IntentOption {
  icon: string;
  label: string;
  value: string;
}

const intentOptions: IntentOption[] = [
  { icon: "\u{1F373}", label: "Kitchen renovation", value: "kitchen_renovation" },
  { icon: "\u{1F6C1}", label: "Bathroom renovation", value: "bathroom_renovation" },
  { icon: "\u{1F6CB}\uFE0F", label: "Living room refresh", value: "living_room_refresh" },
  { icon: "\u{1F6CF}\uFE0F", label: "Bedroom refresh", value: "bedroom_refresh" },
  { icon: "\u{1F3E0}", label: "Full home renovation", value: "full_home_renovation" },
  { icon: "\u{1FA91}", label: "New furniture shopping", value: "new_furniture_shopping" },
  { icon: "\u{1F4D0}", label: "Just measuring a space", value: "measuring_space" },
];

interface IntentCaptureProps {
  onComplete: (data: { intent: string }) => void;
}

export default function IntentCapture({ onComplete }: IntentCaptureProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  const handleSelect = (value: string) => {
    setSelected(value);

    const data = { intent: value };
    localStorage.setItem("roomsketch-intent", JSON.stringify(data));
    console.log("[IntentCapture] Selected intent:", data);

    // Brief delay to show selection highlight, then transition out
    setTimeout(() => {
      setExiting(true);
      setTimeout(() => onComplete(data), 400);
    }, 300);
  };

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-white"
        >
          <div className="w-full max-w-2xl px-6 py-12">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-3xl sm:text-4xl font-semibold text-center text-gray-900 mb-3"
            >
              What are you planning?
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="text-center text-gray-500 mb-10 text-lg"
            >
              Pick one to get started
            </motion.p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {intentOptions.map((option, i) => (
                <motion.button
                  key={option.value}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.35 }}
                  onClick={() => !selected && handleSelect(option.value)}
                  disabled={!!selected && selected !== option.value}
                  className={`
                    flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left
                    transition-all duration-200 cursor-pointer
                    appearance-none focus:outline-none focus-visible:outline-none active:outline-none
                    ${
                      selected === option.value
                        ? "border-[#3d8a7c] bg-[#3d8a7c]/10 scale-[1.02] shadow-md"
                        : "border-gray-200 hover:border-[#3d8a7c]/50 hover:bg-gray-50"
                    }
                    ${selected && selected !== option.value ? "opacity-40" : ""}
                    disabled:cursor-default
                  `}
                >
                  <span className="text-3xl flex-shrink-0" role="img">
                    {option.icon}
                  </span>
                  <span className="text-base sm:text-lg font-medium text-gray-800">
                    {option.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
