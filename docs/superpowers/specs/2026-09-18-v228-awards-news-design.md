# v2.2.8 Awards, News, Records, and View All Design

## Goal

Unify award result derivation and Best XI presentation while keeping each
award's selection, highlighted player, displayed statistics, and generated
News item on exactly the same scoped match data.

## Canonical award result

An award result is derived once from a scope: league season, finalized league
block, Cup season, or Champions season.  It contains the canonical label,
scope label, final match anchor, scoped player statistics, ranked best player,
and Best XI.  Screens and News consume this result and never select winners
again.  League block labels use `Season N-B` exactly (for example,
`Season 1-2`).

## Presentation

A single award Best XI component wraps the existing Pitch presentation.  It
passes the scoped stats map and the canonical best player as `motmPlayerId`,
therefore retaining the established blue rating badge and star indicator.
Competition-aware labels are: League season `Team of the Season`, League block
`Team of the Month`, Cup `Team of the Cup`, and Champions `Team of the
Tournament`.

## News

News projects canonical award results into one item per player award and one
item per team award.  IDs encode award type, scope identity, and canonical
winner/XI identity.  The feed is always sorted by canonical date descending,
then ID descending.  The Home preview is a newest-first slice of that same
feed.

## View All UX

A shared IntersectionObserver hook observes a sentinel immediately after the
top selector.  Its fixed, safe-area-aware button is hidden while that selector
is visible and smooth-scrolls the owning document to the top.  It is mounted
on full ranking, full News, and expanded Records list surfaces.

## Constraints

No rating formula, competition rule, persistence mechanism, authentication
flow, storage key, or service-worker update path changes.  Rating revision is
8 and storage key remains `football-tracker-v1`.
