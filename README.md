# Football Tracker

Football Tracker v2.6.8 tracks saved football matches, player performances, competitions and historical honors. It uses React, TypeScript and Vite, with localStorage, IndexedDB backup and offline PWA support.

[Open the app](https://leedoyoub.github.io/football-tracker/) · [v2.6.8 release notes and measurements](docs/v2.6.8-release.md)

v2.6.8 adds safe edge Swipe Back on read-only detail screens, removes sticky Back while retaining the normal button, and preserves filters, tabs and scroll restoration. Measured News, Player Overview, ranking movement and Records metric calculations reuse shared facts without changing official results or saved data. The release also fixes service-worker response caching for offline reload. Physical iPhone Safari/PWA behavior remains a documented verification limit.

In v2.6.1, Team Detail adds **History → Honors / Records / Best XI**. Official top scorers, assist leaders and League Golden Glove winners share awards when their primary totals tie. Team honors and individual awards retain the team recorded at the time of the award.

Run `npm.cmd test`, `npm.cmd run lint` and `npm.cmd run build` on Windows (`npm` works in shells without the PowerShell script restriction). For local development use `npm.cmd run dev`. Main pushes trigger the GitHub Pages deployment workflow.

v2.6.6 combines League Award Race and Best XI under one First Half / Second Half / League selector, defaulting to League while preserving valid saved half selections. Cup Stage XI analysis is removed; overall Cup honors and the existing v2.6.5 policies remain unchanged.

v2.6.5 unifies six official Best XI scopes, MVP and Award Race around raw average ratings, 50% playing-time eligibility and participation-scaled team bonuses. First/Second Half honors replace monthly/Champions round/final honors. Team History uses its saved modal tactical formation, 30% team minutes and qualified detailed roles with the existing Team Players pitch. Rating REV13, match MOM, tournament rules and saved data stay unchanged. [Measurements and verification limits](docs/performance/v2.6.5.md) include both cache gains and additional cold-calculation costs.

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
