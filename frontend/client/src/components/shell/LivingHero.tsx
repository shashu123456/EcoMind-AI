/**
 * LivingHero — the animated layer behind the hero copy.
 *
 * One canvas, one requestAnimationFrame loop, no React state per frame: nodes,
 * travelling packets, outward energy pulses, concentric rotating rings, a slow
 * scan sweep and a breathing core. Values are drawn from the live workspace, so
 * the numbers floating through the field are the real ones.
 *
 * It sits behind the existing hero markup (labels, core, signals) and never
 * intercepts pointer events.
 */

import { useEffect, useRef } from "react";

import "./living-hero.css";

type Props = {
  healthScore?: number | null;
  completedStages?: number;
  totalStages?: number;
  rows?: number | null;
  anomalies?: number | null;
};

type Node = { angle: number; radius: number; size: number; phase: number };
type Packet = { from: number; to: number; t: number; speed: number };
type Pulse = { r: number; life: number };

export function LivingHero({
  healthScore = null,
  completedStages = 0,
  totalStages = 10,
  rows = null,
  anomalies = null,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const values = useRef({ healthScore, completedStages, totalStages, rows, anomalies });
  values.current = { healthScore, completedStages, totalStages, rows, anomalies };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = true;

    const nodes: Node[] = Array.from({ length: 26 }, (_, i) => ({
      angle: (i / 26) * Math.PI * 2,
      radius: 0.02 + (i % 3) * 0.012,
      size: 1.1 + (i % 4) * 0.45,
      phase: (i / 26) * Math.PI * 2,
    }));
    const packets: Packet[] = Array.from({ length: 14 }, () => ({
      from: Math.floor(Math.random() * nodes.length),
      to: Math.floor(Math.random() * nodes.length),
      t: Math.random(),
      speed: 0.00028 + Math.random() * 0.0004,
    }));
    const pulses: Pulse[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const nodePoint = (node: Node, cx: number, cy: number, radius: number, time: number) => {
      const wobble = Math.sin(time * 0.0004 + node.phase) * 0.02;
      const angle = node.angle + time * 0.000045 + wobble;
      const r = radius * (0.62 + node.radius * 6);
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.86 };
    };

    const draw = (time: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.46;

      // Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(198, 243, 106, 0.045)";
      const step = 34;
      for (let x = (cx % step) - step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = (cy % step) - step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Rotating concentric rings
      for (let ring = 0; ring < 4; ring += 1) {
        const r = radius * (0.34 + ring * 0.19);
        const spin = time * (ring % 2 === 0 ? 0.00007 : -0.00005) * (1 + ring * 0.3);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(spin);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(198, 243, 106, ${0.16 - ring * 0.028})`;
        ctx.lineWidth = 1;
        ctx.setLineDash(ring % 2 === 0 ? [2, 9] : [42, 16]);
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // arc segment travelling along the ring
        ctx.beginPath();
        ctx.strokeStyle = `rgba(198, 243, 106, ${0.4 - ring * 0.07})`;
        ctx.lineWidth = 1.4;
        ctx.arc(0, 0, r, time * 0.0006 + ring, time * 0.0006 + ring + 0.7);
        ctx.stroke();
        ctx.restore();
      }

      const points = nodes.map(node => nodePoint(node, cx, cy, radius, time));

      // Connections between nearby nodes
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          if (dx * dx + dy * dy < (radius * 0.5) ** 2) {
            ctx.strokeStyle = "rgba(198, 243, 106, 0.06)";
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[j].x, points[j].y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      nodes.forEach((node, index) => {
        const { x, y } = points[index];
        const breathe = 0.6 + 0.4 * Math.sin(time * 0.0011 + node.phase);
        ctx.beginPath();
        ctx.fillStyle = `rgba(198, 243, 106, ${0.22 + breathe * 0.28})`;
        ctx.arc(x, y, node.size * (0.8 + breathe * 0.5), 0, Math.PI * 2);
        ctx.fill();
      });

      // Data packets travelling between nodes
      packets.forEach(packet => {
        packet.t += packet.speed * 16;
        if (packet.t >= 1) {
          packet.t = 0;
          packet.from = packet.to;
          packet.to = Math.floor(Math.random() * points.length);
        }
        const a = points[packet.from];
        const b = points[packet.to];
        if (!a || !b) return;
        const x = a.x + (b.x - a.x) * packet.t;
        const y = a.y + (b.y - a.y) * packet.t;
        ctx.beginPath();
        ctx.fillStyle = "rgba(214, 255, 148, 0.85)";
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(198, 243, 106, 0.16)";
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Energy pulses flowing outward from the core
      if (pulses.length < 3 && Math.random() < 0.02) pulses.push({ r: radius * 0.2, life: 1 });
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const pulse = pulses[i];
        pulse.r += 0.9;
        pulse.life -= 0.006;
        if (pulse.life <= 0) {
          pulses.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.strokeStyle = `rgba(198, 243, 106, ${pulse.life * 0.16})`;
        ctx.lineWidth = 1;
        ctx.arc(cx, cy, pulse.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Breathing core glow
      const breathe = 0.5 + 0.5 * Math.sin(time * 0.0009);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.42);
      glow.addColorStop(0, `rgba(198, 243, 106, ${0.16 + breathe * 0.1})`);
      glow.addColorStop(0.5, "rgba(198, 243, 106, 0.05)");
      glow.addColorStop(1, "rgba(198, 243, 106, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // Slow vertical scan sweep
      const sweepY = ((time * 0.02) % (height + 120)) - 60;
      const sweep = ctx.createLinearGradient(0, sweepY - 60, 0, sweepY + 60);
      sweep.addColorStop(0, "rgba(198, 243, 106, 0)");
      sweep.addColorStop(0.5, "rgba(198, 243, 106, 0.055)");
      sweep.addColorStop(1, "rgba(198, 243, 106, 0)");
      ctx.fillStyle = sweep;
      ctx.fillRect(0, sweepY - 60, width, 120);

      if (!reduced) frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onVisibility = () => {
      running = !window.document.hidden;
      if (running) frame = requestAnimationFrame(draw);
      else cancelAnimationFrame(frame);
    };

    window.document.addEventListener("visibilitychange", onVisibility);
    if (reduced) {
      draw(1200);
    } else {
      frame = requestAnimationFrame(draw);
    }

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="living-hero" aria-hidden="true">
      <canvas ref={canvasRef} className="living-hero__canvas" />
      <div className="living-hero__float living-hero__float--a">
        <small>QUALITY</small>
        <strong>{healthScore != null ? `${Math.round(healthScore)}%` : "—"}</strong>
      </div>
      <div className="living-hero__float living-hero__float--b">
        <small>STAGES</small>
        <strong>
          {completedStages}/{totalStages}
        </strong>
      </div>
      {rows != null && (
        <div className="living-hero__float living-hero__float--c">
          <small>ROWS</small>
          <strong>{rows.toLocaleString("en-IN")}</strong>
        </div>
      )}
      {anomalies != null && (
        <div className="living-hero__float living-hero__float--d">
          <small>EVENTS</small>
          <strong>{anomalies.toLocaleString("en-IN")}</strong>
        </div>
      )}
    </div>
  );
}
