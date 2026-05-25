This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AI Workflow

This repo uses a Claude + Codex workflow for all non-trivial changes. Before filing your first task:

- Read [`AI_SYSTEM/WORKFLOW.md`](AI_SYSTEM/WORKFLOW.md) for the end-to-end loop.
- Read [`AI_SYSTEM/MANUAL_SETUP.md`](AI_SYSTEM/MANUAL_SETUP.md) for one-time label + Project board setup.
- Use the prompt snippets in [`AI_SYSTEM/prompts/`](AI_SYSTEM/prompts/) — you never have to write a Claude or Codex prompt by hand.

File new tasks via the issue templates on the [Issues](../../issues/new/choose) tab. Don't open blank issues.

## Browser Extensions

This repo contains two browser extensions because they support different Etsy workflows:

- [ListingView / v1](etsy-keyword-research/README.md) scans Etsy search, listing, and shop pages and supports the Etsy listing form-filler.
- [CraftPlan Research / v2](src/extension/README.md) scans Etsy Marketplace Insights pages and feeds research freshness signals into the app.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
