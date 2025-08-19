# Granolar

An image→audio instrument built with Vite, React and TypeScript.

## Quickstart

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and add your `VITE_GEMINI_API_KEY`.

## Live Demo

[View the demo](https://<username>.github.io/Granolar/)

## Deploy

Pushing to `main` runs the [GitHub Pages workflow](.github/workflows/deploy.yml) which:

1. Sets `BASE_PATH` for project or user sites.
2. Builds the app (`npm run build`).
3. Copies `dist/index.html` to `dist/404.html` for SPA routing.
4. Publishes the `dist/` folder to GitHub Pages.
