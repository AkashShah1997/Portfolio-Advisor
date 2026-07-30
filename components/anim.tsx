"use client";

import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, type ReactNode } from "react";

/** Shared motion primitives — one easing, one voice, reduced-motion aware. */

export const EASE = [0.22, 0.61, 0.36, 1] as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

export function FadeUp({
  children,
  delay = 0,
  y = 16,
  className,
  once = true,
  mode = "view",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
  /** "view" animates when scrolled into view; "mount" animates immediately on mount (use inside tabs/dynamic lists). */
  mode?: "view" | "mount";
}) {
  if (mode === "mount") {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0, y }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE, delay }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-40px" }}
      transition={{ duration: 0.45, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const staggerChild = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function Stagger({
  children,
  className,
  mode = "view",
}: {
  children: ReactNode;
  className?: string;
  /** "view" animates when scrolled into view; "mount" animates immediately on mount (use inside tabs/dynamic lists). */
  mode?: "view" | "mount";
}) {
  if (mode === "mount") {
    return (
      <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

/** Count-up number that settles with a spring; falls back to static text under reduced motion. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const fmt = format ?? ((x: number) => Math.round(x).toLocaleString());
  const spring = useSpring(0, { stiffness: 90, damping: 22 });
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  const text = useTransform(spring, (v) => fmt(v));
  if (reduce) return <span className={className}>{fmt(value)}</span>;
  return <motion.span className={className}>{text}</motion.span>;
}

/** Height-animated expand/collapse. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Cross-fade + slide between keyed panels (tab content, wizard steps). */
export function Switcher({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        className={className}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
