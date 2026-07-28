const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadContent() {
  const fakeExt = { cmdMap:{}, storageGet(){return '';}, storageSet(){} };
  const sandbox = {
    console,
    fetch: async () => ({ json:async()=>({token:'test'}) }),
    seal:{
      ext:{find:()=>fakeExt,new:()=>fakeExt,register(){},newCmdExecuteResult:()=>({})},
      replyToSender(){}
    }
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', '围城日记.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.__content={ITEM_DB,RECIPES,LOCATIONS,EVENTS,lootPoolFor,HELP_ENTRIES,TUTORIAL_DAYS,WEATHER_TYPES,SURVIVOR_POOL,BACKGROUNDS,TRAITS,GEAR,newSetup,applySetupChoice,setupCatalog,setupPicked,batchChoose,finishSetupStage,tutorialState,tutorialComplete,tutorialPayload,helpPage,registerDailyAction,endDayByRest,migrateState};`, sandbox);
  return sandbox.__content;
}

test('content scale stays large', () => {
  const c = loadContent();
  assert.ok(Object.keys(c.ITEM_DB).length >= 145, 'item database should remain exaggerated');
  assert.ok(c.RECIPES.length >= 20, 'recipe database should remain substantial');
  assert.ok(c.LOCATIONS.length >= 24, 'city should have multiple map pages');
  assert.ok(c.EVENTS.length >= 90, 'event prose should support repeat runs');
});

test('loot and recipe references resolve through the item catalog', () => {
  const c = loadContent();
  const unknownLoot = [];
  for (const loc of c.LOCATIONS) for (const item of loc.loot || []) {
    if (item !== '手枪' && !c.ITEM_DB[item]) unknownLoot.push(`${loc.name}:${item}`);
  }
  const unknownRecipe = [];
  for (const recipe of c.RECIPES) {
    for (const item of Object.keys(recipe.need || {})) if (!c.ITEM_DB[item]) unknownRecipe.push(`${recipe.name}:need:${item}`);
    for (const item of Object.keys(recipe.out || {})) if (!c.ITEM_DB[item]) unknownRecipe.push(`${recipe.name}:out:${item}`);
  }
  assert.deepEqual(unknownLoot, []);
  assert.deepEqual(unknownRecipe, []);
});

test('category loot pools make the expanded catalog reachable', () => {
  const c = loadContent();
  const reachable = new Set();
  for (const loc of c.LOCATIONS) for (const item of c.lootPoolFor(loc)) if (item !== '手枪') reachable.add(item);
  assert.ok(reachable.size >= 100, `only ${reachable.size} catalog items are reachable from scavenging`);
});

test('three-day tutorial covers the major gameplay modules', () => {
  const c = loadContent();
  assert.equal(c.TUTORIAL_DAYS.length, 3);
  const ids = new Set(c.TUTORIAL_DAYS.flatMap(d => d.tasks.map(t => t.id)));
  for (const id of ['status','inventory','map','move','loot','use','rest','base','build','recipes','craft','heal','weather','skills','scout','fight','quests','survivors','rescue','goal','log']) assert.ok(ids.has(id), id);
  const commands = c.HELP_ENTRIES.map(x => x.cmd.split(' ')[0]);
  for (const name of ['help','tutorial','status','action','build','craft','skills','quests','survivors','rescue','goal','legacy']) assert.ok(commands.includes(name), name);
  for (let page = 1; page <= 4; page++) assert.ok(c.helpPage(page).length <= 12, `help page ${page} overflows renderer`);
});

test('tutorial rewards only once per day', () => {
  const c = loadContent();
  const s = {day:1,tutorial:c.tutorialState(),inventory:{},skills:{},skillProgress:{},traits:[],gear:[],base:{capacity:4}};
  for (const task of c.TUTORIAL_DAYS[0].tasks) c.tutorialComplete(s, task.id);
  const after = JSON.stringify(s.inventory);
  c.tutorialComplete(s, c.TUTORIAL_DAYS[0].tasks[0].id);
  assert.equal(JSON.stringify(s.inventory), after);
  assert.equal(s.tutorial.rewarded[1], true);
});

test('opening catalogs are broad and support repeated purchases', () => {
  const c = loadContent();
  assert.ok(c.BACKGROUNDS.length >= 16);
  assert.ok(c.TRAITS.length >= 30);
  assert.ok(c.GEAR.length >= 30);
  const s = c.newSetup('u','测试');
  Object.assign(s,{hp:100,maxHp:100,hunger:60,thirst:60,infection:0,wounds:0,mood:60,skills:{},traits:[],gear:[],inventory:{},weapons:[],base:{capacity:4}});
  c.applySetupChoice(s,c.BACKGROUNDS[0],'background');
  assert.equal(s.setup.step,'trait');
  const before=s.setup.points;
  c.applySetupChoice(s,c.TRAITS[0],'trait');
  c.applySetupChoice(s,c.TRAITS[1],'trait');
  assert.equal(s.setup.step,'trait');
  assert.equal(s.setup.pickedTraits.length,2);
  assert.equal(s.setup.points,before-c.TRAITS[0].cost-c.TRAITS[1].cost);
  s.setup.step='gear';
  c.applySetupChoice(s,c.GEAR[0],'gear');
  c.applySetupChoice(s,c.GEAR[1],'gear');
  assert.equal(s.setup.step,'gear');
  assert.equal(s.setup.pickedGear.length,2);
});

test('all opening equipment items resolve through the item catalog', () => {
  const c=loadContent(),missing=[];
  for(const gear of c.GEAR){if(gear.item&&!c.ITEM_DB[gear.item])missing.push(gear.item);for(const item of Object.keys(gear.extra||{}))if(!c.ITEM_DB[item])missing.push(item);}
  assert.deepEqual([...new Set(missing)],[]);
});

test('batch choose processes multiple indexes in order', () => {
  const c=loadContent(),s=c.newSetup('u','测试');
  Object.assign(s,{hp:100,maxHp:100,hunger:60,thirst:60,infection:0,wounds:0,mood:60,skills:{},traits:[],gear:[],inventory:{},weapons:[],base:{capacity:4}});
  let report=c.batchChoose(s,[1,2,5]);
  assert.deepEqual(Array.from(report.selected),[c.BACKGROUNDS[0].name]);
  assert.equal(s.setup.step,'trait');
  s.setup.points=12;
  report=c.batchChoose(s,[1,2,1,999,3,0,4]);
  assert.equal(s.setup.pickedTraits.length,3);
  assert.ok(report.duplicates.includes(c.TRAITS[0].name));
  assert.ok(report.invalid.includes(999));
  assert.equal(report.finish,true);
  assert.ok(!s.setup.pickedTraits.includes(c.TRAITS[3].name),'items after zero must not be processed');
});

test('batch choose skips expensive items but continues with cheaper ones', () => {
  const c=loadContent(),s=c.newSetup('u','测试');
  Object.assign(s,{setup:{step:'trait',points:2,page:1,pickedTraits:[],pickedGear:[],legacyTrait:null},traits:[],gear:[],inventory:{},weapons:[],base:{capacity:4},hp:100,maxHp:100,mood:60});
  const expensive=c.TRAITS.findIndex(x=>x.cost>2)+1,cheap=c.TRAITS.findIndex(x=>x.cost<=2)+1;
  const report=c.batchChoose(s,[expensive,cheap]);
  assert.equal(report.unaffordable.length,1);
  assert.equal(report.selected.length,1);
  assert.equal(s.setup.pickedTraits[0],c.TRAITS[cheap-1].name);
});

function dayState(c) {
  return c.migrateState({uid:'u',seed:123,step:'active',day:1,phase:1,dailyActions:0,fatigue:0,atBase:true,location:'宿舍',base:{name:'宿舍',capacity:4,defense:50,rooms:[],level:1},inventory:{罐头:5,净水:5},traits:[],gear:[],weapons:[],logs:[],escape:{桥梁:0,汽车:0,直升机:0},skills:{搜刮:1,建造:1,急救:1,制作:1,侦查:1,种植:0},hp:100,maxHp:100,hunger:80,thirst:80,infection:0,wounds:0,mood:80,threat:1,milestones:[],tutorial:c.tutorialState(),survivors:[],quests:[],actionStats:{}});
}

test('actions are unlimited and do not advance the day', () => {
  const c=loadContent(),s=dayState(c),meta={points:0,unlocked:[],runs:0,bestDay:0};
  for(let i=0;i<10;i++) c.registerDailyAction(s,meta,'测试',{outside:true,eventChance:0});
  assert.equal(s.day,1);
  assert.equal(s.dailyActions,10);
  assert.equal(s.fatigue,7);
  assert.ok(s.thirst<80);
});

test('only resting at base advances exactly one day', () => {
  const c=loadContent(),s=dayState(c),meta={points:0,unlocked:[],runs:0,bestDay:0};
  s.atBase=false;s.location='学校超市';
  let result=c.endDayByRest(s,meta);
  assert.equal(result.ok,false);assert.equal(s.day,1);
  s.atBase=true;s.location=s.base.name;
  result=c.endDayByRest(s,meta);
  assert.equal(result.ok,true);assert.equal(s.day,2);assert.equal(s.dailyActions,0);assert.equal(s.fatigue,0);
});

test('tutorial tasks cannot be completed on the wrong day', () => {
  const c=loadContent(),s=dayState(c);
  const tip=c.tutorialComplete(s,'build');
  assert.equal(tip,'');
  assert.equal(Boolean(s.tutorial.completed.build),false);
  s.day=2;c.tutorialComplete(s,'build');
  assert.equal(s.tutorial.completed.build,true);
});
