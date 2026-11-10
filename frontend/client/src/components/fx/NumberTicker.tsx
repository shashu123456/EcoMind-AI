/**
 * NumberTicker — a number that counts up to its recorded value.
 *
 * Started from Magic UI's NumberTicker
 * (https://github.com/magicuidesign/magicui, MIT, Copyright (c) Magic UI) and
 * reimplemented without `framer-motion`: a single requestAnimationFrame pass
 * with an ease-out curve, cancelled on unmount and on reduced-motion. That keeps
 * the KPI strip dependency-free and guarantees the number always settles on the
 * recorded value.
 */

import { useEffect, useRef } from "react";

type Props = {
  value: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
  startValue?: number;
  className?: string;
  suffix?: string;
};

const format = (value: number, decimalPlaces: number) =>
  Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(value.toFixed(decimalPlaces)));

const DURATION = 900;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  decimalPlaces = 0,
  startValue = 0,
  className,
  suffix = "",
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const from = direction === "down" ? value : startValue;
  const to = direction === "down" ? startValue : value;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // The rendered text already holds the recorded value, so a throttled or
    // hidden tab can never leave a KPI showing zero. The animation only takes
    // over once a real frame is available.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let started = false;
    let startTime = 0;

    const step = (now: number) => {
      if (!startTime) startTime = now;
      const progress = Math.min(1, (now - startTime) / DURATION);
      node.textContent = format(from + (to - from) * easeOut(progress), decimalPlaces) + suffix;
      started = true;
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delay * 1000);

    return () => {
      window.clearTimeout(timer);
      if (started) cancelAnimationFrame(frame);
    };
  }, [from, to, delay, decimalPlaces, suffix]);

  return (
    <span ref={ref} className={className}>
      {format(to, decimalPlaces) + suffix}
    </span>
  );
}
