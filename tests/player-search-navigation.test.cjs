const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const read = (path) => fs.readFileSync(require.resolve(`../${path}`), 'utf8')

test('shared player avatar preserves uncropped photos and fallback behavior', () => {
  const avatar = read('src/components/PlayerAvatar.tsx')
  assert(avatar.includes('object-contain object-center'))
  assert(avatar.includes('inset-[8%]'))
  assert(avatar.includes('loading="lazy"') && avatar.includes('onError'))
  assert(avatar.includes("number ?? '—'"))
})

test('New Player search is explicit, optional, and cannot override the chosen app team', () => {
  const screen = read('src/screens/NewPlayerScreen.tsx')
  assert(screen.includes('Search API Player') && screen.includes('onClick={() => void runSearch()}'))
  assert(screen.includes("if (!user) { setApiError('Google sign-in is required"))
  assert(screen.includes("query.length < 3"))
  assert(screen.includes('externalPlayerId: apiSelected.id') && screen.includes('photoUrl: apiSelected.photo'))
  assert(screen.includes('teamIds: [...new Set([selectedPlayer.teamId'))
  assert(!screen.includes('currentTeamId'))
})

test('player search is authenticated server-side, globally searches profiles, and has CORS before auth', () => {
  const helper = read('src/lib/apiFootball.ts'); const edge = read('supabase/functions/api-football-player-search/index.ts')
  assert(helper.includes("functions.invoke('api-football-player-search'"))
  assert(!helper.includes('v3.football.api-sports.io'))
  assert(edge.includes("players/profiles") && edge.includes("url.searchParams.set('search'"))
  assert(edge.indexOf("request.method === 'OPTIONS'") < edge.indexOf("request.headers.get('Authorization')"))
  assert(edge.includes("'Access-Control-Allow-Origin'") && edge.includes("'Access-Control-Allow-Methods': 'POST, OPTIONS'"))
  assert(edge.includes("Deno.env.get('API_FOOTBALL_KEY')"))
})

test('standings team identity uses a dedicated link, while TeamIcon remains visual only', () => {
  const link = read('src/components/TeamLink.tsx'); const table = read('src/components/StandingsTable.tsx'); const detail = read('src/screens/TeamDetailScreen.tsx')
  assert(link.includes('onNavigate(team.id)'))
  assert(table.includes('onTeamNavigate ? <TeamLink'))
  assert(detail.includes('<TeamIcon team={team}') && !detail.includes('TeamLink'))
})
