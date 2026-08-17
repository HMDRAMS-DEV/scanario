import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

function stepRadio<T extends string>(
  e: KeyboardEvent,
  options: { id: T }[],
  value: T,
  onChange: (v: T) => void,
  focus: (id: T) => void,
) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  const idx = options.findIndex((o) => o.id === value);
  if (idx < 0) return;
  const next =
    e.key === "ArrowRight"
      ? (idx + 1) % options.length
      : (idx - 1 + options.length) % options.length;
  const id = options[next].id;
  onChange(id);
  focus(id);
}

/**
 * Sliding-pill radio group (transitions.dev "tabs sliding").
 * The pill renders inside the active button so it always paints above that
 * button's own background — a sibling pill gets hidden behind the unselected
 * track colour.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  labelledBy,
  size = "lg",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  labelledBy: string;
  size?: "lg" | "sm";
}) {
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const groupId = useId();

  return (
    <LayoutGroup id={groupId}>
      <div className={`seg seg-${size}`} role="radiogroup" aria-labelledby={labelledBy}>
        {options.map((opt) => {
          const on = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={`seg-btn${on ? " on" : ""}`}
              ref={(el) => {
                btnRefs.current[opt.id] = el;
              }}
              onClick={() => onChange(opt.id)}
              onKeyDown={(e) =>
                stepRadio(e, options, value, onChange, (id) => {
                  btnRefs.current[id]?.focus();
                })
              }
            >
              {on && (
                <motion.span
                  layoutId={`${groupId}-pill`}
                  className="seg-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="seg-text">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** Digits re-enter from below with blur (transitions.dev "number pop-in"). */
export function SpinningNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const text = String(Math.round(value));
  return (
    <span className={className} aria-hidden="true">
      {text.split("").map((digit, i) => (
        <span className="reel" key={`${i}-${digit}`}>
          <motion.span
            initial={reduce ? false : { y: "60%", filter: "blur(2px)", opacity: 0 }}
            animate={{ y: "0%", filter: "blur(0px)", opacity: 1 }}
            transition={{ delay: i * 0.07, duration: 0.5, ease: [0.34, 1.45, 0.64, 1] }}
          >
            {digit}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Remounts and re-reveals whenever `id` changes. */
export function FadeSwap({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Appear key={id} duration={0.5}>
      {children}
    </Appear>
  );
}

/** Staggered rise + blur (transitions.dev "texts reveal"). */
export function Appear({
  children,
  delay = 0,
  duration = 0.5,
  as = "div",
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  as?: "div" | "li";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, filter: "blur(3px)", y: 12 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{ delay, duration, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}

/**
 * Header + collapsible body (transitions.dev "accordion expand").
 * Height animates with grid-template-rows 0fr → 1fr, so nothing is measured.
 */
export function Disclosure({
  summary,
  children,
  className,
  label,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`acc${className ? ` ${className}` : ""}`} data-open={open}>
      <button
        type="button"
        className="acc-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        {summary}
        <span className="acc-chevron" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="16" height="16">
            <path
              d="M4 6.5L8 10.5L12 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="visually-hidden">{label}</span>
      </button>
      <div className="acc-panel" id={id} role="region">
        <div className="acc-panel-inner">{children}</div>
      </div>
    </div>
  );
}
