import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type TabOption<T extends string = string> = {
  id: T;
  label: string;
  icon?: (props: { size?: number; color?: string }) => ReactNode;
};

export type SegmentedTabSwitchProps<T extends string = string> = {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedTabSwitch<T extends string>({
  options,
  value,
  onChange,
}: SegmentedTabSwitchProps<T>) {
  return (
    <div className="relative flex w-full flex-row rounded-full bg-paper-alt p-1">
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="relative flex flex-1 items-center justify-center rounded-full py-[9px] transition-colors focus:outline-hidden"
            style={{
              cursor: "pointer",
              background: "transparent",
              border: "none",
              paddingLeft: 12,
              paddingRight: 12,
            }}
          >
            {isSelected && (
              <motion.div
                layoutId="segmented-tab-active-pill"
                className="absolute inset-0 rounded-full bg-surface"
                style={{
                  boxShadow:
                    "0 1px 3px rgba(20, 22, 43, 0.08), 0 1px 2px rgba(20, 22, 43, 0.04)",
                }}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex flex-row items-center justify-center gap-[6px]">
              {option.icon?.({
                size: 15,
                color: isSelected ? "#14162B" : "#585B78",
              })}
              <span
                className={`text-[13.5px] transition-colors ${
                  isSelected ? "font-bold text-ink" : "font-semibold text-ink-soft"
                }`}
              >
                {option.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
