# Refactor / Improvement Ideas

## Web bundle size warning

The production build currently warns that some chunks are > 500 kB after minification.

Possible improvements (optional):
- Code-split heavier markdown/rendering code (e.g. lazy-load `react-markdown` / `remark-gfm` or the whole reader panel).
- Configure Vite/Rollup `build.rollupOptions.output.manualChunks` to split vendor chunks more intentionally.

Why this matters: faster initial load and less UI lag when streaming lots of content.
