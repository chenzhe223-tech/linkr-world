import { MAP_W, MAP_H, MAIN_LAND_PATHS, MAIN_PROVINCE_PATHS, INSET_ISLAND_PATHS, INSET_NINE_DASH_PATHS, INSET_RECT, latLngToPercent, CHINA_BOX, MAIN_PROJ } from '../src/lib/chinaMap';
console.log('MAP', MAP_W, MAP_H, 'ratio', (MAP_W / MAP_H).toFixed(3));
console.log('land rings', MAIN_LAND_PATHS.length, 'prov rings', MAIN_PROVINCE_PATHS.length);
console.log('inset islands', INSET_ISLAND_PATHS.length, 'nine-dash', INSET_NINE_DASH_PATHS.length);
for (const s of ['北京', '上海', '成都', '昆明', '拉萨', '乌鲁木齐', '哈尔滨', '三亚', '腾冲', '西双版纳']) void s;
const samples: Array<[string, number, number]> = [
  ['北京', 39.915, 116.4], ['上海', 31.229, 121.47], ['成都', 30.66, 104.07],
  ['昆明', 25.04, 102.71], ['拉萨', 29.65, 91.14], ['乌鲁木齐', 43.83, 87.62],
  ['哈尔滨', 45.80, 126.53], ['三亚', 18.25, 109.51], ['腾冲', 25.02, 100.5],
  ['喀什', 39.47, 75.99],
];
for (const [n, la, ln] of samples) {
  const p = latLngToPercent(la, ln);
  console.log(n.padEnd(5), 'left', p.left.toFixed(1) + '%', 'top', p.top.toFixed(1) + '%');
}
const d = MAIN_LAND_PATHS[0] ?? '';
console.log('first land path head:', d.slice(0, 60));
console.log('inset rect', INSET_RECT);
console.log('box', CHINA_BOX, 'unitsPerDegLat', MAIN_PROJ.unitsPerDegLat.toFixed(3));
