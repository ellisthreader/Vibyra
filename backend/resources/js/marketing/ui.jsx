import React from "react";

export function Container({ narrow = false, className = "", children }) {
  return (
    <div
      className={`mx-auto w-full px-5 sm:px-8 xl:px-16 ${
        narrow ? "max-w-[780px]" : "max-w-[1240px]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Section({ id, className = "", children }) {
  return (
    <section id={id} className={`pt-20 md:pt-24 xl:pt-28 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children }) {
  return (
    <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-violet">
      {children}
    </p>
  );
}

export function SectionTitle({ className = "", children }) {
  return (
    <h2
      className={`mb-5 text-[2rem] font-bold leading-[1.12] tracking-tight md:text-[2.6rem] xl:text-[3rem] ${className}`}
    >
      {children}
    </h2>
  );
}

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-[15.5px] font-semibold transition " +
  "duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet";

export function Button({ href, variant = "primary", small = false, className = "", children, ...rest }) {
  const look =
    variant === "primary"
      ? "bg-[#4667e8] text-white hover:bg-[#3d5acf]"
      : "border border-line-strong text-ink hover:border-white/30 hover:bg-white/5";
  const size = small ? "px-4.5 py-2 text-sm" : "";
  const cls = `${BTN_BASE} ${look} ${size} ${className}`;
  if (href) {
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Chip({ accent = false, children }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
        accent
          ? "border border-violet bg-violet text-white"
          : "border border-line-strong bg-surface-elevated text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

export function MiniCard({ className = "", children }) {
  return (
    <div
      className={`w-full max-w-[360px] rounded-2xl border border-line-strong bg-surface px-6 py-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}
