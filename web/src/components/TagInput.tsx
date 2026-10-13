import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Tag as TagIcon } from "lucide-react";
import { ThemeMode } from "../types";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  theme?: ThemeMode;
}

const PRESET_TAGS = [
  "电信CN2",
  "CU4837",
  "CMI",
  "BGP优质",
  "1Gbps",
  "10Gbps",
  "原生IP",
  "流媒体解锁",
  "软银Softbank",
  "GIA极速",
  "直连优化",
];

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange }) => {
  const [inputValue, setInputValue] = useState("");

  const addTag = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const togglePreset = (preset: string) => {
    if (tags.includes(preset)) {
      removeTag(preset);
    } else {
      addTag(preset);
    }
  };

  return (
    <div className="space-y-2 font-mono text-xs">
      {/* Active tags container */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] min-h-[40px] focus-within:border-[var(--nezha-ink)] transition-colors">
        <AnimatePresence initial={false} mode="popLayout">
          {tags.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="inline-flex"
            >
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none border border-[var(--nezha-line)] bg-[var(--nezha-panel)] text-[var(--nezha-ink)] text-xs font-mono font-bold">
                <TagIcon className="h-3 w-3 shrink-0 text-[var(--nezha-accent)]" />
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="cursor-pointer p-0.5 ml-0.5 text-[var(--nezha-ink-3)] hover:text-rose-500 transition-colors"
                  title="删除标签"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </motion.span>
          ))}
        </AnimatePresence>

        {/* Text input */}
        <div className="flex-1 min-w-[120px] flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => inputValue && addTag(inputValue)}
            placeholder={tags.length === 0 ? "输入标签并回车添加..." : "添加标签..."}
            className="w-full bg-transparent text-xs font-mono text-[var(--nezha-ink)] placeholder:text-[var(--nezha-ink-3)] focus:outline-none py-1 px-1"
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="p-1 rounded-none bg-[var(--nezha-accent)] text-[#141414] text-xs font-mono shrink-0 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preset recommendations */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono">
        <span className="text-11 font-bold text-[var(--nezha-ink-3)]">
          快捷推荐:
        </span>
        {PRESET_TAGS.map((preset) => {
          const isSelected = tags.includes(preset);
          return (
            <button
              key={preset}
              type="button"
              onClick={() => togglePreset(preset)}
              className={`h-6 px-2 rounded-none border text-11 font-mono font-bold transition-colors cursor-pointer ${
                isSelected
                  ? "border-[var(--nezha-accent)] bg-[var(--nezha-accent)] text-[#141414]"
                  : "border border-[var(--nezha-line)] bg-[var(--nezha-panel-sub)] hover:border-[var(--nezha-ink)] hover:bg-[var(--nezha-panel)] text-[var(--nezha-ink)]"
              }`}
            >
              {isSelected ? `✓ ${preset}` : `+ ${preset}`}
            </button>
          );
        })}
      </div>
    </div>
  );
};
