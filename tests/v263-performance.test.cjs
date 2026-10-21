require('./helpers/register-ts.cjs')
const test=require('node:test'), assert=require('node:assert/strict')
const {performanceFixture}=require('./helpers/v255-fixture.cjs')
const {buildGlobalRankingData,rankGlobalRankingRows}=require('../src/engine/stats.ts')
const {competitionMatches}=require('../src/engine/competition.ts')
const {officialSeasonModel}=require('../src/engine/officialAwards.ts')
const {seasonAwards}=require('../src/engine/awards.ts')
const {scopedIndividualAwardEvents}=require('../src/engine/teamAwardRecords.ts')

test('position changes reuse the same derived facts and keep stable ranking order',()=>{
 const s=performanceFixture(1), games=competitionMatches(s.matches,'Season 1','league')
 const all=buildGlobalRankingData(s.players,games,{seasons:[],teams:[],positions:[]},'rating')
 const defenders=buildGlobalRankingData(s.players,games,{seasons:[],teams:[],positions:['CB']},'rating')
 assert.ok(defenders.length>0)
 assert.deepEqual(defenders.map(r=>r.playerId),all.filter(r=>r.scopedPositionFamily==='CB').map(r=>r.playerId))
 for(const row of defenders) assert.strictEqual(row.ratings,all.find(item=>item.playerId===row.playerId).ratings)
 const expected=rankGlobalRankingRows(all,s.players,'goals').filter(r=>r.scopedPositionFamily==='CB')
 assert.deepEqual(rankGlobalRankingRows(defenders,s.players,'goals'),expected)
})

test('competition match index notices same-array item replacement and deletion',()=>{
 const s=performanceFixture(1), first=s.matches[0]
 const old=competitionMatches(s.matches,'Season 1','league'); assert.ok(old.includes(first))
 s.matches[0]={...first,competitionType:'cup',competitionStage:'stage1'}
 const next=competitionMatches(s.matches,'Season 1','league')
 assert.equal(next.length,old.length-1); assert.ok(!next.includes(first))
 s.matches.splice(1,1)
 assert.equal(competitionMatches(s.matches,'Season 1','league').length,old.length-2)
})

test('ranking cache notices same-array match replacement, addition, deletion and player replacement',()=>{
 const s=performanceFixture(1), games=s.matches.slice(0,16), filter={seasons:[],teams:[],positions:[]}
 const query=()=>buildGlobalRankingData(s.players,games,filter,'rating')
 const old=query(), id=s.players[9].id; assert.equal(old.find(r=>r.playerId===id).goals,1)
 games[0]={...games[0],events:games[0].events.filter(e=>e.playerId!==id)}
 assert.equal(query().find(r=>r.playerId===id).goals,0)
 games.push({...games[0],id:'added'});assert.equal(query().find(r=>r.playerId===id).matches,2)
 games.pop();assert.equal(query().find(r=>r.playerId===id).matches,1)
 s.players[9]={...s.players[9],teamId:'transfer'};assert.equal(query().find(r=>r.playerId===id).teamId,'transfer')
})

test('official, scoped and season award caches update after same-array match and player replacements',()=>{
 const s=performanceFixture(1), scope={seasons:[],competition:'all',teamIds:[]}
 const model=officialSeasonModel(s.teams,s.players,s.matches,s.competitionStates,'Season 1')
 const old= model.events, scoped=scopedIndividualAwardEvents(s.teams,s.players,s.matches,s.competitionStates,scope), season=seasonAwards('Season 1',s.teams,s.players,s.matches,s.competitionStates)
 assert.ok(old.length>0);assert.ok(scoped.length>0)
 s.matches[0]={...s.matches[0],season:'Season 2'}
 assert.ok(!officialSeasonModel(s.teams,s.players,s.matches,s.competitionStates,'Season 1').events.some(e=>e.kind==='league-mvp'))
 assert.ok(!scopedIndividualAwardEvents(s.teams,s.players,s.matches,s.competitionStates,scope).some(e=>e.kind==='league-mvp'))
 assert.notStrictEqual(seasonAwards('Season 1',s.teams,s.players,s.matches,s.competitionStates),season)
 s.players[0]={...s.players[0],name:'Edited'}
 assert.notStrictEqual(officialSeasonModel(s.teams,s.players,s.matches,s.competitionStates,'Season 1'),model)
})

test('official events skip unfinished competition candidate derivation until awards are requested',()=>{
 const path=require('node:path'), {sourceModule}=require('./helpers/v259-harness.cjs'), actual=require('../src/engine/awards.ts'), calls=[]
 const isolated=sourceModule(path.resolve(__dirname,'..'),'engine/officialAwards.ts',{'./awards':{...actual,awardsForCompetition(...args){calls.push(args[0]);return actual.awardsForCompetition(...args)}}})
 const s=performanceFixture(1), model=isolated.officialSeasonModel(s.teams,s.players,s.matches,s.competitionStates,'Season 1')
 assert.ok(model.events.some(e=>e.kind==='league-mvp'))
 assert.deepEqual(calls,['league'])
 assert.equal(model.competitionAwards.cup.complete,false);assert.equal(model.competitionAwards.champions.complete,false)
 assert.deepEqual(calls,['league','cup','champions'])
 assert.strictEqual(model.events,model.events)
})

test('metric ordering drops players removed from the same roster array',()=>{
 const s=performanceFixture(1), rows=buildGlobalRankingData(s.players,s.matches.slice(0,16),{seasons:[],teams:[],positions:[]},'rating')
 const old=rankGlobalRankingRows(rows,s.players,'goals'), id=s.players[9].id
 assert.ok(old.some(row=>row.playerId===id))
 s.players.splice(9,1)
 assert.ok(!rankGlobalRankingRows(rows,s.players,'goals').some(row=>row.playerId===id))
})

test('Records player awards remove a revoked official result after same-array replacement',()=>{
 const {awardRecordGroups}=require('../src/engine/awardRecords.ts')
 const s=performanceFixture(1), scope={seasons:[],teamIds:[],competition:'all',positionFilter:'all'}
 const run=()=>awardRecordGroups(s.teams,s.players,s.matches,s.competitionStates,scope,['awards-league-mvp'])
 assert.ok(run()[0].rows.length>0)
 s.matches[0]={...s.matches[0],season:'Season 2'}
 assert.equal(run()[0].rows.length,0)
})

test('Latest Changes removes revoked league title and monthly awards after a same-array replacement',()=>{
 const {deriveLatestChanges}=require('../src/engine/latestChanges.ts')
 const s=performanceFixture(1)
 const run=()=>deriveLatestChanges(s.players,s.teams,s.matches,s.competitionStates,'Season 1').flatMap(group=>group.items)
 const original=run();assert.ok(original.some(item=>item.id.startsWith('title:Season 1:league:')))
 assert.ok(original.some(item=>item.id.startsWith('award:player-of-month:Season 1-1:')))
 s.matches[0]={...s.matches[0],season:'Season 2'}
 const updated=run()
 assert.ok(!updated.some(item=>item.id.startsWith('title:Season 1:league:')))
 assert.ok(!updated.some(item=>item.id.startsWith('award:player-of-month:Season 1-1:')))
})
