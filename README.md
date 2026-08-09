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

Recommended next steps to make this site production-ready:

- Customize site content: Replace placeholders in `index.html` (company name, copy, projects) and add your logo at `assets/logo.svg`.
- Analytics: Replace the GA4 placeholder `G-XXXXXXX` in `index.html` with your Measurement ID or remove if undesired.
- Contact form: Sign up at Formspree (https://formspree.io) and replace the `action` URL in the contact form (`index.html`) with your form endpoint.
- SEO & Social: Update the `og:` meta tags and `link rel=canonical` in `index.html` to your production domain.
- Custom domain (GitHub Pages): create a `CNAME` file at the repository root with your domain (e.g. `example.com`) and add the same domain in the repository Pages settings. Netlify and Vercel have guided UIs for adding domains and enabling HTTPS.

Security & privacy note:

- If you enable analytics or forms, update your privacy policy and include opt-out links where necessary.

Need help customizing content, connecting a form, or configuring a domain? Tell me your company name, contact email, and domain and I will finish the setup and push the changes.
