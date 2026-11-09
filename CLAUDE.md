# CLAUDE.md

Project: THE BACKROOMS: ENDLESS — procedural first-person exploration horror (three.js + TypeScript + Vite, packaged with Electron).

- The spec is `SPEC_v0.3.md` (authoritative). Follow its phases (§15) in order; log progress in `PROGRESS.md`.
- No external assets: textures are Canvas-generated (`src/proc-tex`), audio is Web Audio (`src/systems/audio.ts`).
- World generation must be deterministic: use `src/core/rng.ts` (`hashInts`, `hash01`, `Rng`), never `Math.random()`.
- Keep generators pure (no three.js imports) so they can be unit-tested: `src/levels/**` and `src/world/chunkData.ts`, `chunkManager.ts`, `collision.ts`.
- Before committing: `npm run build` and `npm test` must pass.
- Do not copy layouts, text or names from commercial Backrooms games. UI text lives in `src/ui/ja.json`.
