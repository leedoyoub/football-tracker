require('./helpers/register-ts.cjs')
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path')
const {screenHarness,nodes}=require('./helpers/v259-harness.cjs')
const history=require('../src/engine/teamHistory.ts')
const loadPlacement=()=>require('../src/engine/teamHistoryPlacement.ts').placeTeamHistoryPlayers
const player=(id,extra={})=>({id,name:id,position:'GK',teamId:'elsewhere',...extra})
const slot=(id,group)=>({slot:`${group}-${id}`,displayPosition:group,position:group==='DEF'?'CB':'CM',playerId:id,teamId:'A',matches:3,avgRating:7})
const game=(id,appearances,extra={})=>({id,season:'Season 1',teamId:'A',homeTeamId:'A',awayTeamId:'opponent',duration:90,competitionType:'league',formation:'4-4-2',events:[],appearances:appearances.map(([playerId,position,other={}])=>({playerId,position,matchPosition:position,teamId:'A',role:'starter',...other})),...extra})

test('Honors uses fullName then name then historical label, preserving count, disclosures and links',()=>{
 const players=[player('released',{name:'Ronaldo',fullName:'  Cristiano Ronaldo dos Santos Aveiro  ',displayName:'CR7',teamId:''}),player('transferred',{name:'  Name fallback  ',fullName:'  '}),player('display',{name:'',fullName:'',displayName:'Historical display'}),player('blank',{name:'  ',fullName:'  '})]
 const ids=['released','transferred','display','deleted','blank']
 const events=ids.flatMap((playerId,index)=>Array.from({length:index===0?2:1},(_,i)=>({id:`${playerId}:${i}`,kind:'monthly-player',label:'Player of the Month',playerId,teamId:'A',season:'Season 1',period:1+i,category:'individual',finalized:true})))
 const model={seasonHistory:[],championships:0,runnerUps:0,finals:0,individual:history.groupTeamIndividualHonors(events)}
 const h=screenHarness(path.resolve(__dirname,'..'),'screens/TeamHistory.tsx','TeamHistory',{}, {'../engine/teamHistory':{...history,teamHistoryHonors:()=>model}})
 const links=[],patches=[],disclosures=['kind:monthly-player','kind:monthly-player:player:released']
 const tree=h.render({teamId:'A',season:'Season 1',teams:[{id:'A'}],players,matches:[],states:[],screenState:{historyMenu:'honors',historyDisclosures:disclosures},onNavigate:v=>links.push(v),onStateChange:p=>patches.push(p)})
 for(const [i,name] of ['Cristiano Ronaldo dos Santos Aveiro','Name fallback','Historical display','Historical player (deleted)','Historical player (blank)'].entries()){
  const button=nodes(tree,n=>n.type==='button'&&n.props.children===name)[0];assert.ok(button,name)
  assert.match(button.props.className,/overflow-wrap:anywhere/);button.props.onClick();assert.equal(links[i].id,ids[i]);assert.equal(links[i].season,'Season 1')
 }
 assert.equal(patches.length,0);assert.equal(model.individual[0].count,6);assert.equal(model.individual[0].players[0].count,2)
 assert(nodes(tree,n=>n.type==='span'&&n.props.children==='Season 1-2').length)
 assert(nodes(tree,n=>n.type==='button'&&n.props['aria-expanded']===true&&n.props['aria-label']?.includes('Cristiano Ronaldo')).length)
})

test('four-plus defender/midfielder groups use actual wing minutes without changing selected slot facts',()=>{
 const place=loadPlacement(),players=['c1','c2','l','r'].map(id=>player(id)),slots=players.map(p=>slot(p.id,'DEF'))
 const games=[game('m',[['l','LWB'],['r','RWB'],['c1','CB'],['c2','RCB']])]
 const before=JSON.stringify(slots),result=place(slots,players,games,'A')
 assert.deepEqual(result.map(s=>s.playerId),['l','c1','c2','r']);assert.equal(JSON.stringify(slots),before)
 assert.deepEqual(result.slice().sort((a,b)=>a.playerId.localeCompare(b.playerId)),slots.slice().sort((a,b)=>a.playerId.localeCompare(b.playerId)))
 const mids=players.map(p=>slot(p.id,'MID')),midGames=[game('mid',[['l','CM',{positionHistory:[{minute:30,position:'LM'}]}],['r','RM'],['c1','CDM'],['c2','CAM']])]
 assert.deepEqual(place(mids,players,midGames,'A').map(s=>s.playerId),['l','c1','c2','r'])
 assert.deepEqual(place(slots.slice(0,3),players,games,'A'),slots.slice(0,3),'three defenders retain selection order')
 assert.deepEqual(place(mids,players,[game('no-wings',players.map(p=>[p.id,'CM']))],'A'),mids)
})

test('dual-side players are assigned jointly, ties follow selection order, and vacancies remain',()=>{
 const place=loadPlacement(),players=['central','dual','left','last'].map(id=>player(id)),slots=players.map(p=>slot(p.id,'MID'))
 const games=[game('dual',[['dual','LM',{positionHistory:[{minute:40,position:'RM'}]}],['left','LM'],['central','CAM'],['last','CM']])]
 assert.deepEqual(place(slots,players,games,'A').map(s=>s.playerId),['left','central','last','dual'])
 const ties=[game('ties',[['dual','LM'],['left','LM'],['central','CM'],['last','CM']])]
 assert.equal(place(slots,players,ties,'A')[0].playerId,'dual')
 const vacant=[...slots,{...slot('empty','MID'),playerId:null}]
 const result=place(vacant,players,games,'A');assert.equal(result[0].playerId,'left');assert.equal(result.at(-1).playerId,'dual')
 assert.equal(result.filter(s=>s.playerId===null).length,1);assert.equal(new Set(result.filter(s=>s.playerId).map(s=>s.playerId)).size,4)
})

test('side minutes preserve historical team, substitute intervals and same-array replacement',()=>{
 const place=loadPlacement(),players=['central','sub','left','last'].map(id=>player(id)),slots=players.map(p=>slot(p.id,'MID'))
 const games=[game('sub',[['central','CM'],['left','LM'],['last','CM'],['sub','RM',{role:'bench'}]],{events:[{id:'in',type:'sub',minute:60,teamId:'A',playerInId:'sub',playerOutId:'out',position:'RM'}]}),game('foreign',[['left','RM',{teamId:'B'}]],{teamId:'B',homeTeamId:'B'})]
 assert.deepEqual(place(slots,players,games,'A').map(s=>s.playerId),['left','central','last','sub'])
 games[0]=game('edit',[['central','LM'],['left','CM'],['last','RM'],['sub','CM']])
 assert.deepEqual(place(slots,players,games,'A').map(s=>s.playerId),['central','sub','left','last'])
})

test('scoped History placement changes coordinates only, preserving the v2.6.3 selected eleven',()=>{
 const {selectTeamHistoryBestXI}=require('../src/engine/teamHistorySelection.ts')
 const roles=['GK','CB','CB','LB','RB','CM','CM','LM','RM','ST','ST'],players=roles.map((_,i)=>player(`p${i}`))
 const games=Array.from({length:3},(_,i)=>game(`a${i}`,roles.map((role,j)=>[`p${j}`,role])))
 const other=[game('other-season',roles.map((_,i)=>[`p${i}`,i===1?'LB':'RM']),{season:'Season 2'}),game('other-cup',roles.map((_,i)=>[`p${i}`,i===1?'LB':'RM']),{competitionType:'cup'})]
 const result=history.teamHistoryBestXI(players,[...games,...other],{teamId:'A',season:'Season 1',competition:'league'})
 const baseline=selectTeamHistoryBestXI(players,games,'A')
 const facts=s=>s.map(({x:_x,y:_y,...rest})=>rest).sort((a,b)=>a.slot.localeCompare(b.slot))
 assert.deepEqual(facts(result.bestXI),facts(baseline.bestXI));assert.equal(result.minimumAppearances,baseline.minimumAppearances)
 assert.deepEqual(result.statsByPlayer,baseline.statsByPlayer);assert.equal(result.bestPlayerId,baseline.bestPlayerId)
 const defenders=result.bestXI.filter(s=>s.displayPosition==='DEF').sort((a,b)=>a.x-b.x),mids=result.bestXI.filter(s=>s.displayPosition==='MID').sort((a,b)=>a.x-b.x)
 assert.equal(defenders[0].playerId,'p3');assert.equal(defenders.at(-1).playerId,'p4')
 assert.equal(mids[0].playerId,'p7');assert.equal(mids.at(-1).playerId,'p8')
})
