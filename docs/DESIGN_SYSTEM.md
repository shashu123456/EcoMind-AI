# EcoMind AI — Design System (Locked Contract)

Source of the locked UI/UX contract. Frontend must follow this exactly (tokens.css + lib/interactive). See Blueprint §11 for philosophy.

## Aesthetic — Industrial Skeuomorphism
"Industrial Realism": tactile precision, mechanical reliability. Top-left 45° light source always; shadows are structural, not decorative.
- Elevation: Level −1 recessed (inputs/screens: inner shadows), Level 0 chassis (matte plastic), Level +1 panels (dual-shadow lift), Level +2 floating controls.
- Default theme is **light** (`--chassis #e0e5ec` desk). Dark terminal monitors stay dark for signal clarity. "Light desk, dark screens."

## Tokens (tokens.css — Industrial block, `[data-theme='light']`)
### Surfaces
| Token | Value |
|---|---|
| `--chassis` | `#e0e5ec` (Level 0 bg) |
| `--panel-lt` | `#f0f2f5` (Level +1 panels) |
| `--muted` | `#d1d9e6` (Level −1 recessed) |
| `--bor-shadow` | `#babecc` |
| `--bor-light` | `#ffffff` |
| `--bor-deep` | `#a3b1c6` |

### Text
| Token | Value |
|---|---|
| `--ink` / `--t-hi` | `#2d3436` |
| `--ink-mid` / `--t-mid` | `#4a5568` |
| `--t-lo` | `#6b7684` |

### Interactive accent (sparingly — interactive/status/alert only)
| Token | Value |
|---|---|
| `--accent` (safety orange) | `#ff4757` |
| accent foreground | `#ffffff` |
| `--color-primary` | `var(--accent)` |

Dark accent surfaces (stat strips, terminals): `#2d3436`/`#2c3e50`, text `#ffffff`/`#e0e5ec`/`#a8b2d1`, accent stays `#ff4757`.

### Neumorphic shadows (the signature)
| Token | Value |
|---|---|
| `--shadow-card` | `8px 8px 16px #babecc, -8px -8px 16px #ffffff` |
| `--shadow-floating` | `12px 12px 24px #babecc, -12px -12px 24px #ffffff, inset 1px 1px 0 rgba(255,255,255,0.5)` |
| `--shadow-pressed` | `inset 6px 6px 12px #babecc, inset -6px -6px 12px #ffffff` |
| `--shadow-recessed` | `inset 4px 4px 8px #babecc, inset -4px -4px 8px #ffffff` |
| `--shadow-sharp` | `4px 4px 8px rgba(0,0,0,0.15), -1px -1px 1px rgba(255,255,255,0.8)` |
| `--shadow-glow` (orange) | `0 0 10px 2px rgba(255,71,87,0.6)` |
| `--shadow-glow-green` | `0 0 10px 2px rgba(34,197,94,1)` |

### Radius
sm 4 · md 8 (`--radius-button`) · lg 16 (`--radius-card`) · xl 24 · 2xl 30+ · full `9999px`. Soft injection-molded curves.

### Textures
- Fractal-noise SVG overlay (0.24 opacity, mix-blend overlay) over the chassis page background.
- CRT scanlines on terminal screens (`background: linear-gradient(rgba(18,16,16,0) 50%, rgba(0,0,0,0.22) 50%); background-size: 100% 4px`).
- Blueprint grid (`#636e72` 1px lines, 40px cells, opacity 0.1).
- Radial white top-left hotspots on the body.

## Typography
| Role | Font | Notes |
|---|---|---|
| Body + headings | Inter (400/500/600/700/800) | `.font-display` = Inter settls |
| Numbers / labels / metadata / stamped labels | JetBrains Mono | xs–sm, uppercase, 0.05–0.08em tracking, weight 700 |
| Hero | 3xl–5xl, w800, tight −0.03em, white drop-shadow on dark media |
| Section | 2xl–3xl w700 |
| Body | 1rem–1.125rem, lh 1.6–1.75, ~60–65 chars max |

## Motion
- Spring ease (bounce): `cubic-bezier(0.175, 0.885, 0.32, 1.275)` — exposed as `:root --spring`. Framer `B` replaced where interactive.
- Durations: 150–200ms interactions, 300ms smooth, 500ms imagery.
- Button press: `translateY(2px)` + reversed inset shadows, 150ms.
- Card hover: `-translate-y-1` + `--shadow-floating`, 300ms ease-out.
- GPU transforms only. `prefers-reduced-motion` respected.

## Signature elements (tokens.css industrial utilities)
- `.screws` — recessed machine screws at the 12px corners of panels.
- `.vent-slot` — recessed 4×22px rounded pills; three with gap-1 = vent strip.
- `.led` + `.led-online/.led-alert/.led-warn/.led-idle` — 9px indicators with status glow (+`animate-pulse`).
- `.scanlines` // `.blueprint-grid` — CRT / schematic textures.
- `.phys-key` — physical key button (press 2px + inset shadows + focus orange outline).
- `.input-well` — recessed input well (inset shadow, focus = orange ring).
- `.connector-pipe` — 12px cylindrical link between steps.
- `.device-bezel` + `.device-screen` + `.power-led` — 3D device mockup (bezel, screen, pulsing power LED).
- `.pushpin` / `.pushpin-top` — drop shadow for floating tags.
- `.glass-panel` / `.glass-card` — Level +1 panels: chassis gradient + `--shadow-card`; hover lifts to `--shadow-floating`.

## Interaction components (lib/interactive)
| Component | Source | Used in |
|---|---|---|
| `RippleTransition` | WebGL ripple image transition (noise wave + chroma split + center pinch) | Dashboard hero device-screen; Login backdrop |
| `AnnotatedText` | hand-drawn marks: wavy/underline/doubleUnderline/dottedUnderline/line/arrow/highlight/circle/box/bracket/strikethrough/crossOut | Dashboard hero tagline (highlight); RawProcessedComparison (+X% underline, conclusion highlight) |
| `SplitFlapDisplay` | airport departure-board char flips, 3D flap keyframes | Dashboard launch strip dataset readout |
| `MatrixRain` | canvas digital rain (green/cyan/rainbow, theme-aware) | Dashboard empty state idle backdrop |
| `PixelatedReveal` | processed/passing data renders sharp, rest pixelated (seeded blocks, frontier strip) | DQEngine "repaired stream · live reveal" panel |
| `cn` | clsx wrapper (shared) | all primitives + Login |

All primitives re-exported from `lib/interactive/index.ts`; WebGL ones wrapped in `WebGLErrorBoundary` → `WebGLFallback`.

## Signatures & chrome
- **JourneyMap rail** — 6 milestones (Intake · Understand · Rebuild · Model · Prove · Decide), each a button with status LED + progress dots, connected by `.connector-pipe`; click opens inline stage dropdown; pass-through (visual-only) stages carry a tiny "bg" chip; overall progress = animated gradient track.
- **Mission Control** — device-bezel hero (ripple media), SplitFlap dataset readout, screws-on-panel launch strip, neumorphic stat cards, MatrixRain idle empty state.
- **Data Quality stream** — raw rows + `PixelatedReveal` repaired-stream panel with live LED (idle → repairing → clean).
- **Login** — full-screen ripple backdrop, recessed input wells, safety-orange physical submit key, system LED.
- Terminals (`RoomStage`) stay dark monitors with scanlines + typewriter; all pages use light neumorphic panels.

## Principles
Industrial realism; motion communicates computation (data flows: ripple, flap, rain, pixelate); transparency (LEDs show real system state); accessibility; responsive; design tokens; no inline styles; no duplicate CSS.