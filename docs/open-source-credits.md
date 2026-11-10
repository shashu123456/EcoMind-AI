# Open-source credits

EcoMind vendors a small number of MIT-licensed animation components so the
animated hero does not need a new dependency tree. All of them were adapted to
this project's existing stack (`framer-motion`, plain CSS) and styled with
EcoMind tokens.

## Magic UI

- Source: https://github.com/magicuidesign/magicui
- Files adapted:
  - `frontend/client/src/components/fx/AnimatedBeam.tsx`
    (from `apps/www/registry/magicui/animated-beam.tsx`)
  - `frontend/client/src/components/fx/NumberTicker.tsx`
    (started from `apps/www/registry/magicui/number-ticker.tsx`; reimplemented
    with a single `requestAnimationFrame` pass so it needs no animation runtime
    and falls back to the settled value when frames are throttled)
- Changes: `motion/react` imports replaced with `framer-motion`;
  Tailwind utility classes replaced with local classes; the `cn` helper removed.

```
MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## First-party animation

- `frontend/client/src/components/shell/LivingHero.tsx` — EcoMind canvas particle
  field (written for this project), reused as the hero backdrop.
- `frontend/client/src/components/fx/EnergyFlow.tsx` — EcoMind layout over the
  vendored beam.
