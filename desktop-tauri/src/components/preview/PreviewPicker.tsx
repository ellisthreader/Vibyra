import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface PreviewPickerOption {
  key: string;
  label: string;
  group?: string;
  meta?: string;
  disabled?: boolean;
}

interface Props {
  label: string;
  value: string;
  options: PreviewPickerOption[];
  onChange: (key: string) => void;
  compact?: boolean;
}

export function PreviewPicker({ label, value, options, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const selected = options.find((option) => option.key === value) ?? options[0];
  const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  const openAt = (index: number) => {
    if (index < 0) return;
    setActiveIndex(index);
    setOpen(true);
  };

  const move = (direction: number) => {
    if (!enabled.length) return;
    const current = enabled.indexOf(activeIndex);
    const next = current < 0 ? 0 : (current + direction + enabled.length) % enabled.length;
    setActiveIndex(enabled[next]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const first = enabled[0] ?? -1;
    const last = enabled[enabled.length - 1] ?? -1;
    if (!open) {
      const selectedIndex = options.findIndex(
        (option) => option.key === value && !option.disabled,
      );
      const edge = event.key === "ArrowUp" || event.key === "End" ? last : first;
      openAt(selectedIndex >= 0 && !["Home", "End"].includes(event.key) ? selectedIndex : edge);
    } else if (event.key === "Home") {
      setActiveIndex(first);
    } else if (event.key === "End") {
      setActiveIndex(last);
    } else {
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  };

  let previousGroup = "";
  return (
    <div
      ref={host}
      className={"preview-picker " + (compact ? "preview-picker--compact" : "")}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={trigger}
        type="button"
        className="preview-picker__trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        onClick={() => {
          if (open) return setOpen(false);
          const index = options.findIndex(
            (option) => option.key === value && !option.disabled,
          );
          openAt(index >= 0 ? index : enabled[0] ?? -1);
        }}
      >
        <span className="preview-picker__copy">
          <strong>{selected?.label ?? label}</strong>
          {!compact && selected?.meta && <small>{selected.meta}</small>}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="preview-picker__menu" role="listbox" aria-label={label}>
          {options.map((option, index) => {
            const heading = option.group && option.group !== previousGroup ? option.group : null;
            previousGroup = option.group ?? previousGroup;
            return (
              <div key={option.key} role="presentation">
                {heading && <div className="preview-picker__group">{heading}</div>}
                <button
                  ref={(node) => { optionRefs.current[index] = node; }}
                  type="button"
                  role="option"
                  aria-selected={option.key === value}
                  disabled={option.disabled}
                  className={
                    "preview-picker__option " +
                    (option.key === value ? "preview-picker__option--selected" : "")
                  }
                  onClick={() => choose(option.key)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.meta && <small>{option.meta}</small>}
                  </span>
                  {option.key === value && <span className="preview-picker__check">✓</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
