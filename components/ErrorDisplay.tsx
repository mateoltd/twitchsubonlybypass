import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";

interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  const isH265 = /hev1|h\.265|hevc/i.test(message);

  return (
    <div className="mx-auto mt-16 max-w-md animate-slide-up text-center sm:mt-20">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error">
        <IconAlertTriangle size={20} stroke={1.8} />
      </div>

      <p className="text-[15px] font-semibold tracking-tight text-text">
        {message}
      </p>

      {isH265 && (
        <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
          This VOD uses H.265/HEVC encoding which your browser may not
          support. Try a Chromium-based browser with HEVC support.
        </p>
      )}

      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-phantom px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-[0.97]"
      >
        Try again
        <IconArrowRight size={14} stroke={2.5} />
      </button>
    </div>
  );
}
