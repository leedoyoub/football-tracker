# Football Tracker

Football Tracker v2.6.1 tracks saved football matches, player performances, competitions and historical honors. It uses React, TypeScript and Vite, with local IndexedDB storage and offline PWA support.

[Open the app](https://leedoyoub.github.io/football-tracker/) · [v2.6.1 release notes](docs/v2.6.1-release.md)

In v2.6.1, Team Detail adds **History → Honors / Records / Best XI**. Official top scorers, assist leaders and League Golden Glove winners share awards when their primary totals tie. Team honors and individual awards retain the team recorded at the time of the award.

Run `npm.cmd test`, `npm.cmd run lint` and `npm.cmd run build` on Windows (`npm` works in shells without the PowerShell script restriction). For local development use `npm.cmd run dev`. Main pushes trigger the GitHub Pages deployment workflow.

## Development template notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
