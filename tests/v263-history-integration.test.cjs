require('./helpers/register-ts.cjs')
const {test}=require('node:test'), assert=require('node:assert/strict'), path=require('node:path')
const history=require('../src/engine/teamHistory.ts')
const {screenHarness,nodes}=require('./helpers/v259-harness.cjs')

test('History records invalidate after same-array match replacement, addition and deletion',()=>{
  const players=[{id:'p',name:'Historical Player',teamId:'B',position:'ST'}]
  const match={id:'m',teamId:'A',homeTeamId:'A',awayTeamId:'B',season:'Season 1',duration:90,competitionType:'league',appearances:[{playerId:'p',teamId:'A',role:'starter',position:'ST'}],events:[]}
  const matches=[match],scope={teamId:'A',season:'Season 1',competition:'all'}
  const goals=()=>history.teamHistoryRecords(players,matches,scope)[0].rows[0]?.value
  assert.equal(goals(),0)
  matches[0]={...match,events:[{id:'g',type:'goal',minute:10,teamId:'A',playerId:'p'}]}
  assert.equal(goals(),1)
  matches.push({...match,id:'m2'});assert.equal(history.teamHistoryRecords(players,matches,scope)[2].rows[0].value,2)
  matches.splice(0,2);assert.equal(goals(),undefined)
})

test('History Best XI explains selected formation and scope, passes vacancies and retains player navigation',()=>{
  const formation={label:'3-5-2',defenders:3,midfielders:5,forwards:2,matches:6}
  const result={bestXI:[{slot:'GK-1',playerId:'p'}],statsByPlayer:{},teamMatches:9,minimumAppearances:4,formation}
  const h=screenHarness(path.resolve(__dirname,'..'),'screens/TeamHistory.tsx','TeamHistory',{}, {'../engine/teamHistory':{...history,teamHistoryBestXI:()=>result}})
  const destinations=[],props={teamId:'A',season:'Season 3',teams:[{id:'A'}],players:[],matches:[],states:[],screenState:{historyMenu:'best-xi',historyCompetition:'champions'},onStateChange:()=>{},onNavigate:v=>destinations.push(v)}
  const tree=h.render(props),award=nodes(tree,n=>n.type?.name==='AwardBestXI')[0]
  const text=JSON.stringify(tree)
  assert.match(text,/3-5-2/);assert.match(text,/Champions/);assert.match(text,/Most-used formation/)
  assert.equal(award.props.showEmptySlots,true);assert.strictEqual(award.props.result,result)
  award.props.onPlayerOpen('p');assert.deepEqual(destinations,[{name:'player',id:'p',season:'Season 3',competitionType:'champions'}])
  result.formation=null;result.bestXI=[]
  const empty=h.render({...props,screenState:{...props.screenState,historyCompetition:'cup'}})
  assert.match(JSON.stringify(empty),/No valid saved kickoff formation/)
  assert.equal(nodes(empty,n=>n.type?.name==='AwardBestXI').length,0)
})

test('History formation scopes stay separate and same-array edits invalidate the entire XI',()=>{
  const players=[{id:'p',name:'Released',teamId:'',position:'GK'}]
  const make=(id,teamId,season,competitionType,formation)=>({id,teamId,homeTeamId:teamId,awayTeamId:'opponent',season,competitionType,formation,duration:90,events:[],appearances:[{playerId:'p',teamId,role:'starter',position:'CM'}]})
  const matches=[make('a','A','Season 1','league','3-4-1-2'),make('b','A','Season 1','cup','4-2-3-1'),make('c','A','Season 2','league','4-4-2'),make('d','B','Season 1','league','4-3-3')]
  const scope={teamId:'A',season:'Season 1',competition:'league'}
  const first=history.teamHistoryBestXI(players,matches,scope)
  assert.equal(first.formation.label,'3-5-2');assert.equal(first.teamMatches,1)
  assert.strictEqual(history.teamHistoryBestXI(players,matches,scope),first)
  assert.equal(history.teamHistoryBestXI(players,matches,{...scope,competition:'cup'}).formation.label,'4-5-1')
  assert.equal(history.teamHistoryBestXI(players,matches,{...scope,season:'Season 2'}).formation.label,'4-4-2')
  assert.equal(history.teamHistoryBestXI(players,matches,{...scope,teamId:'B'}).formation.label,'4-3-3')
  matches[0]={...matches[0],formation:'4-4-2'}
  assert.equal(history.teamHistoryBestXI(players,matches,scope).formation.label,'4-4-2')
  players[0]={...players[0],teamId:'new-team'}
  assert.equal(history.teamHistoryBestXI(players,matches,scope).bestXI.find(slot=>slot.playerId==='p').teamId,'A')
})

test('History honors invalidate revoked awards and preserve independent competition scopes',()=>{
  const {performanceFixture}=require('./helpers/v255-fixture.cjs'),s=performanceFixture(1)
  const teamId=require('../src/engine/officialAwards.ts').officialSeasonModel(s.teams,s.players,s.matches,s.competitionStates,'Season 1').teamResults.find(result=>result.champion).teamId
  const first=history.teamHistoryHonors(s.teams,s.players,s.matches,s.competitionStates,teamId,'all')
  assert.ok(first.championships>0)
  s.matches[0]={...s.matches[0],season:'Season 2'}
  const updated=history.teamHistoryHonors(s.teams,s.players,s.matches,s.competitionStates,teamId,'all')
  assert.notStrictEqual(updated,first);assert.equal(updated.championships,0)
  assert.deepEqual(updated,history.teamHistoryHonors(s.teams.slice(),s.players.slice(),s.matches.slice(),s.competitionStates.slice(),teamId,'all'))
  assert(history.teamHistoryHonors(s.teams,s.players,s.matches,s.competitionStates,teamId,'cup').individual.every(kind=>kind.players.every(player=>player.events.every(event=>event.competition==='cup'))))
})
