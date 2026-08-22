import React from "react";

const ICONS = {
  windows: "/platform-icons/microsoft.svg",
  linux: "/platform-icons/linux-tux.svg",
  macos: "/platform-icons/apple.svg",
};

export default function PlatformRow({ platform, name, meta, recommended, disabled, action, children }) {
  const className = [
    "platform-row",
    recommended ? "platform-row--recommended" : "",
    disabled ? "platform-row--disabled" : "",
  ].filter(Boolean).join(" ");
  return (
    <article className={className} aria-disabled={disabled || undefined}>
      <div className="platform-row__head">
        <span className="platform-row__icon" aria-hidden="true"><img src={ICONS[platform]} alt="" /></span>
        <div className="platform-row__titles">
          <strong>{name}</strong>
          {meta && <span>{meta}</span>}
        </div>
        {(recommended || action) && <span className="platform-row__side">
          {recommended && <span className="platform-row__badge">Your platform</span>}
          {action}
        </span>}
      </div>
      {children}
    </article>
  );
}
