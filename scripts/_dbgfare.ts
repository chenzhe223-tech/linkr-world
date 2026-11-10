import { planJourneyLegs } from '../src/lib/journey';
import { buildFareLedger } from '../src/lib/fares';

function run(label: string, over: any) {
  const input: any = {
    origin: '',
    route: ['shanghai'],
    days: 5,
    startDate: '2026-05-01',
    returnMode: 'round-trip',
    oneWay: false,
    departPref: 'auto',
    returnPref: 'auto',
    now: '2026-05-01',
    city: '上海',
    travelers: 1,
    interests: ['书店'],
    wish: '一个人去上海 5 天，想逛书店，不赶路',
    pace: 'slow',
    ...over,
  };
  const lc: any = planJourneyLegs(input);
  console.log(`\n=== ${label} · origin="${input.origin}" route=${JSON.stringify(input.route)} ===`);
  for (const l of lc.legs) {
    console.log(
      `  ${String(l.kind).padEnd(9)} ${String(l.from).padEnd(6)} -> ${String(l.to).padEnd(6)} fare=${l.fare ? `${l.fare.modeKey}/${l.fare.status}/${l.fare.low}-${l.fare.high}` : 'null'}`
    );
  }
  console.log('directFlight =', JSON.stringify(lc.directFlight ?? null));
  const led = buildFareLedger({ legs: lc.legs, travelers: 1, manual: {} });
  console.log('ledger lines =', led.lines.length, '| notice =', led.notices.join(' / '));
}

run('上海单城 · 无出发地', {});
run('上海单城 · 杭州出发', { origin: '杭州' });
run('上海单城 · 北京出发', { origin: '北京' });
run('上海单城 · 广州出发 4天', { origin: '广州', days: 4 });
run('上海→杭州 5天 · 北京出发', { origin: '北京', route: ['shanghai', 'hangzhou'], days: 5 });
