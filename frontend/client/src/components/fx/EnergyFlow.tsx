/**
 * EnergyFlow — the hero's living data path.
 *
 * One source node (the recorded dataset) feeding the recorded stages, with a
 * light beam travelling along each connection. The beams come from Magic UI's
 * MIT-licensed AnimatedBeam (see ./AnimatedBeam.tsx); the layout and the node
 * values are EcoMind's, and every number shown is a recorded workspace value.
 */

import { useRef, type RefObject } from "react";
import { AnimatedBeam } from "./AnimatedBeam";
import "./fx.css";

export type EnergyFlowNode = {
  label: string;
  value: string;
  done: boolean;
};

export function EnergyFlow({
  sourceLabel,
  sourceValue,
  nodes,
}: {
  sourceLabel: string;
  sourceValue: string;
  nodes: EnergyFlowNode[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  // Stable ref objects: AnimatedBeam measures `.current` after commit, so the
  // array itself must not be rebuilt on every render.
  const targetRefs = useRef<Array<RefObject<HTMLLIElement | null>>>(
    nodes.map(() => ({ current: null })),
  );

  return (
    <div className="energy-flow" ref={containerRef}>
      <div className="energy-flow__source" ref={sourceRef}>
        <span className="energy-flow__source-ring" />
        <span className="energy-flow__bolt" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
          </svg>
        </span>
        <strong>{sourceLabel}</strong>
        <small>{sourceValue}</small>
      </div>

      <ul className="energy-flow__targets">
        {nodes.map((node, index) => (
          <li
            key={node.label}
            className={`energy-flow__target ${node.done ? "is-done" : ""}`}
            ref={targetRefs.current[index]}
          >
            <span className="energy-flow__target-dot" />
            <span className="energy-flow__target-label">{node.label}</span>
            <strong>{node.value}</strong>
          </li>
        ))}
      </ul>

      {nodes.map((node, index) => {
        return (
          <AnimatedBeam
            key={`${node.label}-beam`}
            containerRef={containerRef}
            fromRef={sourceRef}
            toRef={targetRefs.current[index]}
            curvature={(index - (nodes.length - 1) / 2) * 26}
            duration={3.6 + index * 0.45}
            delay={index * 0.35}
            pathColor="#6f8f76"
            pathOpacity={node.done ? 0.28 : 0.14}
            pathWidth={1.3}
            gradientStartColor="#c6f36a"
            gradientStopColor="#57d6a2"
          />
        );
      })}
    </div>
  );
}
