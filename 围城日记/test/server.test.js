const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 3889, path, method, headers: body ? {'Content-Type':'application/json'} : {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let child;
test.before(async () => {
  const root = require('node:path').join(__dirname, '..');
  const referenceModules = require('node:path').join(root, '..', '星际迷航', 'application', 'node_modules');
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_PATH: referenceModules }), stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    try { const r = await request('/health'); if (r.status === 200) return; } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('backend did not start');
});
test.after(() => child && child.kill());

test('health endpoint', async () => {
  const r = await request('/health');
  assert.equal(r.status, 200);
  assert.match(r.body.toString(), /ok/);
});

test('status renderer returns a png', async () => {
  const r = await request('/render/status', 'POST', { state: { name:'测试者', day:4, phase:2, hp:72, maxHp:100, hunger:64, thirst:48, infection:8, wounds:12, mood:73, threat:31, base:{name:'学校宿舍',defense:9,level:1}, inventory:{罐头:3,净水:2} } });
  assert.equal(r.status, 200);
  assert.equal(r.type, 'image/png');
  assert.ok(r.body.length > 1000);
  assert.equal(r.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('all gameplay renderers return png data', async () => {
  const samples = {
    setup:{state:{points:12,title:'开局',options:[{name:'宿舍',cost:0,desc:'门锁还能用'}]}},
    event:{state:{day:3,title:'雨夜',headline:'门外有脚步',text:'你屏住呼吸。',danger:true}},
    base:{state:{name:'宿舍',defense:8,rooms:[{name:'加固门',built:true,effect:'防御'}]}},
    map:{state:{current:'学校超市',spots:[{name:'药房',kind:'医疗',risk:20}]}},
    inventory:{state:{name:'测试者',day:4,page:1,weight:8.4,capacity:24,rows:[{name:'罐头',count:3,use:'食物',weight:.5,rarity:'普通',desc:'铁盒'}]}},
    tutorial:{state:{day:1,title:'第一天',intro:'学习基本生存。',reward:'净水×2',tasks:[{text:'查看状态',cmd:'.wjd status',done:true},{text:'查看地图',cmd:'.wjd map',done:false}]}},
    help:{state:{page:1,entries:[{cmd:'status',summary:'查看状态'}]}},
    'help-detail':{state:{cmd:'status',group:'生存',aliases:'状态',summary:'查看状态',usage:'.wjd status',detail:'查看六项状态。',examples:['.wjd status']}},
    skills:{state:{name:'测试者',day:3,rows:[{name:'搜刮',level:2,xp:4,need:24,aptitude:2}]}},
    quests:{state:{day:3,rows:[{title:'搜刮',desc:'完成两次',progress:1,need:2,done:false,reward:'罐头×2'}]}},
    survivors:{state:{name:'宿舍',day:3,rows:[{name:'林医生',job:'医生',desc:'来自诊所',trust:35,bonus:'急救',value:2}]}},
    death:{state:{day:9,cause:'没有等到天亮',achievements:['活过第一周'],legacyPoints:3}},
    escape:{state:{threat:70,plans:[{name:'修桥',desc:'接通北岸',need:'零件',ready:false}]}}
  };
  for (const [route, body] of Object.entries(samples)) {
    const r = await request(`/render/${route}`, 'POST', body);
    assert.equal(r.status, 200, route); assert.equal(r.type, 'image/png', route); assert.ok(r.body.length > 1000, route);
  }
});

test('cache token follows the reference plugin protocol', async () => {
  const put = await request('/cache-data', 'POST', {name:'缓存幸存者',day:2,hp:80,hunger:50,thirst:60,infection:0,wounds:3,mood:70,base:{name:'平房',defense:5},inventory:{罐头:2}});
  assert.equal(put.status, 200);
  const token = JSON.parse(put.body.toString()).token;
  const r = await request(`/render/status?token=${token}`);
  assert.equal(r.status, 200); assert.equal(r.type, 'image/png'); assert.ok(r.body.length > 1000);
});
