# richo-portfolio
Personal portfolio and projects for Richo.

This repository contains a minimal static portfolio scaffold and deployment configurations for multiple platforms.

Deployment targets provided:

- GitHub Pages (GitHub Actions workflow in `.github/workflows/deploy-pages.yml`)
- Vercel (configuration in `vercel.json`)
- Netlify (configuration in `netlify.toml`)
- Docker (static site served by Nginx; see `Dockerfile`)

Quick start (preview locally):

Docker (recommended for a local preview):

```bash
# build image
docker build -t richo-portfolio .

# run container (open http://localhost:8080)
docker run --rm -p 8080:80 richo-portfolio
```

GitHub Pages:

Push to `main` and the GitHub Actions workflow will publish the repository to GitHub Pages.

Vercel / Netlify:

Connect the repository to your Vercel or Netlify account and the platform will deploy the static site automatically.

If you want a different stack scaffolded, tell me which (React, Next.js, Hugo, etc.) and I will add it.
