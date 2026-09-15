import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Tag as TagIcon } from "lucide-react";
import { Button, Chip } from "@heroui/react";
import { getTagStyle } from "../utils/tagColors";
import { cn } from "../lib/utils";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  theme?: "blueprint" | "dark";
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

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange, theme = "dark" }) => {
  const isBlueprint = theme === "blueprint";
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
    <div className="space-y-2">
      {/* Active tags container */}
      <div
        className={`flex flex-wrap items-center gap-1.5 p-2 rounded-xl border min-h-[44px] transition-colors ${
          isBlueprint
            ? "bg-white border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20"
            : "bg-zinc-950 border-zinc-800 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/20"
        }`}
      >
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
              {/* motion wraps rather than replaces the Chip: framer-motion needs a
                  ref to animate, and Chip renders a plain span without forwarding one. */}
              <Chip
                size="sm"
                variant="soft"
                className={cn(
                  "h-auto gap-1.5 border px-2.5 py-1 text-xs font-sans font-medium shadow-sm",
                  getTagStyle(tag, isBlueprint)
                )}
              >
                <TagIcon className="h-3 w-3 shrink-0 opacity-75" />
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="cursor-pointer rounded-full p-0.5 opacity-70 transition-all hover:bg-black/15 hover:opacity-100 active:scale-90"
                  title="删除标签"
                >
                  <X className="h-3 w-3" />
                </button>
              </Chip>
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
            className={`w-full bg-transparent text-xs font-mono focus:outline-none py-1 px-1 ${
              isBlueprint ? "text-slate-900 placeholder:text-slate-400" : "text-zinc-100 placeholder:text-zinc-500"
            }`}
          />
          {inputValue.trim() && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono shrink-0 transition-all cursor-pointer active:scale-90"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preset recommendations */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className={`text-11 font-mono ${isBlueprint ? "text-slate-500 font-medium" : "text-zinc-400"}`}>
          快捷推荐:
        </span>
        {PRESET_TAGS.map((preset) => {
          const isSelected = tags.includes(preset);
          return (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant="ghost"
              onPress={() => togglePreset(preset)}
              className={cn(
                "h-auto rounded-full border px-2 py-0.5 font-mono text-11 transition-all active:scale-95",
                isSelected
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                  : isBlueprint
                  ? "bg-slate-100/80 text-slate-700 border-slate-200 hover:bg-slate-200/80 hover:text-slate-900"
                  : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              {isSelected ? `✓ ${preset}` : `+ ${preset}`}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
