# Merge Odds

Paste a GitHub repo. See the odds that your PR gets merged.

This repo is being built in the open, one small pull request at a time. Right now it holds the project setup:
a page that shows the name, and a worker with one API route.

- **Worker:** [Hono](https://hono.dev) on Cloudflare Workers (`worker/`). One endpoint: `GET /api/analyze?repo=owner/name`.
- **UI:** Vite, React and Tailwind (`src/`).

## Run it

```bash
npm install
npm run dev
```

## Licence

MIT: see `LICENSE`. The typeface is Paper Mono, under the SIL Open Font License: see `src/assets/fonts/OFL.txt`.
