# privacy-photo
Blur people faces depending on parameters

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
# Output goes to dist/
```

---

## Deployment

### Cloudflare Pages

1. Push your repo to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com) → **Create a project** → **Connect to Git**
3. Select your repository
4. Set the build configuration:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**

Auto-deploys on every push to `main`. No config file required.

---

### GitHub Pages

1. Install the `gh-pages` package:

```bash
npm install --save-dev gh-pages
```

2. Add a `deploy` script to `package.json`:

```json
"scripts": {
  "deploy": "gh-pages -d dist"
}
```

3. Update `vite.config.js` to set the base path (replace `privacy-photo` with your repo name):

```js
export default defineConfig({
  base: '/privacy-photo/',
  plugins: [react()],
})
```

4. Build and deploy:

```bash
npm run build
npm run deploy
```

5. In your GitHub repo go to **Settings → Pages** and set the source to the `gh-pages` branch.

> **Note:** The `base` path in `vite.config.js` must match your repository name, otherwise assets won't load.

---

## Versioning

The patch version in `package.json` is automatically incremented on every `git push` via a pre-push hook. Versions follow `major.minor.patch` — e.g. `1.0.0` → `1.0.1`.

---

**Version:** 0.0.0
**1st and 7th Frome Scouts**
