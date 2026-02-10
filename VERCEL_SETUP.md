# Vercel Deployment Setup

This monorepo contains multiple deployable packages: `server` and `web`. Each should be deployed as a separate Vercel project.

## Server Project Setup

1. Import this repository in Vercel Dashboard
2. Configure the project settings:

    - **Root Directory**: `packages/server`
    - **Build Command**: `npm run server:build`
    - **Output Directory**: `packages/server/dist`
    - **Install Command**: `npm install`
    - **Node.js Version**: `20.x`

3. Set environment variables as needed for your server

## Web Project Setup

1. Import this repository again as a new Vercel project
2. Configure the project settings:

    - **Root Directory**: `packages/web`
    - **Build Command**: `npm run web:build`
    - **Output Directory**: `packages/web/build`
    - **Install Command**: `npm install`
    - **Framework Preset**: SvelteKit (auto-detected)

3. Set environment variables:
    - `VITE_API_URL` - URL of your deployed server project

## Notes

-   Both projects share the `packages/common` workspace
-   The build commands automatically build `common` first
-   Each project can be deployed independently
-   Use different domains or subdomains for each project
