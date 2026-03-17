"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconClipboard, IconSearch } from "@tabler/icons-react";
import { Logo, LogoMark } from "./Logo";

interface VodInputProps {
  onSubmit: (url: string) => void;
  disabled: boolean;
  compact: boolean;
}

export function VodInput({ onSubmit, disabled, compact }: VodInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursorX, setCursorX] = useState(0);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(input);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ("letterSpacing" in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
        style.letterSpacing;
    }

    const textWidth = ctx.measureText(value).width;
    const scrollLeft = input.scrollLeft;
    const maxVisible = input.clientWidth;

    setCursorX(Math.min(Math.max(textWidth - scrollLeft, 0), maxVisible));
  }, [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        inputRef.current?.focus();
      }
    } catch {
      /* clipboard permission denied */
    }
  };

  /* ── Compact bar for /?v= ── */
  if (compact) {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-1.5 animate-fade-in sm:gap-3 sm:p-2"
      >
        <div className="relative min-w-0 flex-1">
          <IconSearch
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            size={14}
            stroke={2}
          />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="VOD link or ID..."
            disabled={disabled}
            className="w-full rounded-lg bg-white/[0.03] py-2 pl-8 pr-3 text-[13px] text-text placeholder:text-text-tertiary outline-none transition-colors focus:bg-white/[0.06] disabled:opacity-40"
          />
        </div>

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-phantom px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-[0.97] disabled:opacity-30"
        >
          <span className="hidden sm:inline">
            {disabled ? "Resolving" : "Go"}
          </span>
        </button>
      </form>
    );
  }

  const showCursor = isFocused || !value;
  const shouldBlink = !isFocused && !value;

  /* ── Hero input for / ── */
  return (
    <section className="animate-fade-in">
      <div className="mt-16 flex flex-col items-center sm:mt-24">
        <Logo size={52} className="mb-8 animate-float text-text sm:mb-10" />

        <h1 className="text-center text-[2.5rem] font-bold leading-[1] tracking-[-0.035em] text-text sm:text-5xl lg:text-[4.5rem]">
          Watch Twitch VODs
        </h1>
        <h1 className="mt-1 text-center text-[2.5rem] font-bold leading-[1] tracking-[-0.035em] text-text-tertiary sm:text-5xl lg:text-[4.5rem]">
          Without Walls
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-2xl sm:mt-12">
        <div className="group flex items-center border-b border-white/[0.08] pb-5 transition-colors focus-within:border-white/20 sm:pb-6">
          {/* Input area with overlaid cursor */}
          <div
            className="relative min-w-0 flex-1 cursor-text overflow-hidden"
            onClick={() => inputRef.current?.focus()}
          >
            {/* Decorative cursor — tracks text boundary */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-7 w-[2px] rounded-full bg-text-secondary sm:h-9"
              style={{
                left: cursorX,
                transition:
                  "left 80ms cubic-bezier(0.25, 1, 0.5, 1), opacity 150ms ease",
                animation: shouldBlink
                  ? "cursor-blink 1.3s ease-in-out infinite"
                  : "none",
                opacity: showCursor ? 1 : 0,
              }}
            />

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Paste a Twitch VOD link or ID..."
              disabled={disabled}
              autoFocus
              style={{ caretColor: "transparent" }}
              className="w-full bg-transparent py-1 text-3xl font-medium tracking-tight text-text placeholder:text-text-tertiary/40 outline-none sm:text-5xl"
            />
          </div>

          {/* Paste from clipboard */}
          <button
            type="button"
            onClick={handlePaste}
            className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text active:scale-95 sm:ml-4 sm:h-11 sm:w-11"
          >
            <IconClipboard size={18} stroke={2} />
          </button>

          {/* Submit */}
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className="ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-phantom text-white transition-all hover:bg-phantom-dark active:scale-95 disabled:opacity-20 sm:ml-2 sm:h-12 sm:w-12"
          >
            {disabled ? (
              <LoadingSpinner />
            ) : (
              <IconArrowRight size={20} stroke={2.5} />
            )}
          </button>
        </div>
        <p className="mt-3 text-center text-[12px] text-text-tertiary/50">
          Paste a link, VOD ID, or full URL to start watching
        </p>
      </form>
    </section>
  );
}

function LoadingSpinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-80"
      />
    </svg>
  );
}
