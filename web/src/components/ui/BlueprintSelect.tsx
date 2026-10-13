import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SelectOption {
  key: string;
  label: string;
}

interface BlueprintSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (val: string) => void;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  "aria-label"?: string;
}

export const BlueprintSelect: React.FC<BlueprintSelectProps> = ({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  dropdownClassName,
  placeholder = "请选择",
  disabled = false,
  align = "left",
  "aria-label": ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = options.find((o) => o.key === value);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className={cn(
          "w-full h-8 px-2.5 flex items-center justify-between text-xs font-mono font-bold rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] text-[var(--nezha-ink)] hover:border-[var(--nezha-ink)] focus:border-[var(--nezha-accent)] focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen && "border-[var(--nezha-accent)]",
          buttonClassName
        )}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[var(--nezha-ink-3)] shrink-0 transition-transform duration-150 ml-1.5",
            isOpen && "rotate-180 text-[var(--nezha-accent)]"
          )}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute top-full z-[100] mt-1 max-h-56 overflow-y-auto rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] shadow-2xl py-1",
            align === "right" ? "right-0 min-w-full" : "left-0 w-full min-w-full",
            dropdownClassName
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.key === value;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  onChange(opt.key);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-2.5 py-1.5 text-left text-xs font-mono font-bold flex items-center justify-between transition-colors cursor-pointer",
                  isSelected
                    ? "bg-[var(--nezha-accent)] text-[#141414]"
                    : "text-[var(--nezha-ink)] hover:bg-[var(--nezha-panel-sub)] hover:text-[var(--nezha-accent-ink)]"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-3 w-3 shrink-0 text-[#141414] ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
