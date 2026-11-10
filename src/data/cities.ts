// Link-R World — 10 城档案（首期上线城市）
//
// 每座城市一份"旅行档案"：状态色、城市性格、四月气候、文艺主题候选、
// 旅行配色与穿搭建议。所有气候与票价数据来自公开资料核实（详见各来源行）。
// 旅行状态色遵循品牌手册 v2 规则：进入某目的地，Aurora 渐变的终点色切换为该城市状态色。

export type CityId =
  | 'shanghai'
  | 'beijing'
  | 'suzhou'
  | 'hangzhou'
  | 'wuxi'
  | 'puer'
  | 'xishuangbanna'
  | 'dali'
  | 'tengchong'
  | 'lijiang'
  | 'xian'
  | 'quanzhou'
  | 'chengdu';

/** 旅行配色里的一格 */
export interface PaletteSwatch {
  hex: string;
  /** 中文色名（来自城市实景） */
  name: string;
  /** 建议用在哪个单品 / 场景 */
  use: string;
}

/** 一条穿搭建议 */
export interface OutfitItem {
  piece: string;
  detail: string;
}

/** 文艺主题候选（由用户输入的兴趣词触发） */
export interface CityTheme {
  /** 触发关键词（与用户输入做包含匹配） */
  keys: string[];
  /** 主题句（文艺，一整句） */
  line: string;
  /** 英文短题 */
  en: string;
}

/** 季节（由出发月份推导，穿搭口径随它走） */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

/** 月份 → 季节（3–5 春 / 6–8 夏 / 9–11 秋 / 12、1、2 冬），越界收敛到 1–12 */
export function seasonOfMonth(month1to12: number): Season {
  const m = ((Math.round(month1to12) - 1) % 12 + 12) % 12 + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** 'YYYY-MM-DD' → 月份（1–12）；解析不了回落到当前月 */
export function monthOfISO(iso: string | null | undefined): number {
  const m = Number(String(iso ?? '').slice(5, 7));
  if (Number.isInteger(m) && m >= 1 && m <= 12) return m;
  return currentMonth();
}

export interface CityInfo {
  id: CityId;
  name: string;
  nameEn: string;
  province: string;
  /** 城市中心坐标（用于地图取景） */
  lat: number;
  lng: number;
  /** 旅行状态色：Aurora 渐变在该城市的终点色 */
  stateColor: string;
  stateColorName: string;
  /** 城市性格关键词 */
  character: string[];
  /** 一句城市气质 */
  intro: string;
  /** 城市标语（页顶横幅用，突出城市节奏） */
  slogan: { title: string; sub: string };
  /** 四月气候（常年均值口径，来源见注释） */
  climate: {
    highC: number;
    lowC: number;
    note: string;
  };
  themes: CityTheme[];
  palette: PaletteSwatch[];
  outfit: {
    /** 穿搭口径按出发季节取用（与 MONTHLY_CLIMATE 同一套气候事实） */
    summary: Record<Season, string>;
    items: OutfitItem[];
  };
  /** 市内交通一句话（用于生成通勤方式的现实感） */
  transport: string;
}

/*
 * 四月气候数据来源（常年均值）：
 * 上海 17.3°C / 北京 15.9°C（9–21°C） / 杭州 18.1°C（21.6/12.3）
 * 无锡 20.0/11.1°C（中国气象数据网 1981–2010）
 * 苏州 常年 4 月均温约 16°C（江苏省统计口径 15.4°C）
 * 西安 9–21°C，约 4 个雨天
 * 泉州 17.0/24.7°C，约 8 个雨天（Climate-Data 1991–2021）
 * 成都 14/23.6°C，约 6 个雨天（Climate-Data 1991–2021）
 * 普洱（思茅）14.8/28.5°C（中国气象局 1981–2010）
 * 西双版纳（景洪）18.6/33.4°C（1991–2020 平均）
 * 大理 22.8/10.2°C（新浪天气·中国气象局历史气候口径）
 * 腾冲 23.2/10.4°C（中国气象局气象数据中心 1981–2010）
 * 丽江 20.2/8.3°C（中国气象局 1981–2010）
 */
export const CITIES: CityInfo[] = [
  {
    id: 'shanghai',
    name: '上海',
    nameEn: 'Shanghai',
    province: '上海',
    lat: 31.229,
    lng: 121.469,
    stateColor: '#5B7FA6',
    stateColorName: '江流蓝',
    character: ['梧桐', '里弄', '江岸', '咖啡馆', '夜航船'],
    intro: '江水把城市分成两半，也把一天分成两种走法。',
    slogan: { title: '上海，慢慢走', sub: '在梧桐与江岸之间，把一天走成两种潮汐。' },
    climate: { highC: 20, lowC: 12, note: '春雨说来就来，梧桐刚抽芽，江边风大' },
    themes: [
      {
        keys: ['书店', '阅读', '书', '旧书'],
        line: '弄堂尽头的灯，和一页没读完的书',
        en: 'Lanes & Pages',
      },
      {
        keys: ['咖啡', '咖啡馆', '街角'],
        line: '一杯咖啡的时间，刚好走完三个街区',
        en: 'Coffee & Corners',
      },
      {
        keys: ['江', '外滩', '滨江', '夜'],
        line: '等灯亮起来，江水才承认它是金的',
        en: 'River of Lights',
      },
      {
        keys: ['美术馆', '展览', '看展', '艺术'],
        line: '把一天泡进展厅，出来时天刚好黑',
        en: 'Slow Museums',
      },
      {
        keys: ['建筑', '老房子', '里弄', '石库门'],
        line: '砖缝里的年份，比门牌更诚实',
        en: 'Brick & Year',
      },
    ],
    palette: [
      { hex: '#5B7FA6', name: '江流蓝', use: '外套主色 · 外滩晨雾里的江面' },
      { hex: '#0A0F1A', name: '夜航黑', use: '长裤 / 包 · 夜里的黄浦江' },
      { hex: '#E8E4D8', name: '梧桐米', use: '上衣 · 武康路的墙' },
      { hex: '#B9C6D6', name: '石库门灰蓝', use: '针织 · 阴天的清水砖墙' },
      { hex: '#C09A5E', name: '铜灯暖', use: '配饰点缀 · 老房子的门牌与灯' },
    ],
    outfit: {
      summary: {
        spring: '上海春天是"洋葱式"的一天：早晚像初冬，中午像初夏，江边永远比市区低两度。',
        summer: '上海夏天又闷又晒，走两步一身汗，户外的部分安排在早晚，中午交给室内。',
        autumn: '上海秋天是最好走的季节：干爽、天高，只是江边风大，外套随身。',
        winter: '上海冬天湿冷入骨，体感比温度更低，保暖先挡风再谈厚度。',
      },
      items: [
        { piece: '防风薄外套', detail: '挡江边的风，深色最耐走' },
        { piece: '可叠穿内层', detail: '衬衫或薄针织，中午塞进包里' },
        { piece: '好走的鞋', detail: '石板路加地铁楼梯，一天两万步起' },
        { piece: '能装的小包', detail: '书店战利品比计划里多' },
        { piece: '折叠伞', detail: '雨不提前打招呼' },
      ],
    },
    transport: '地铁覆盖最密，短途骑车比打车快；过江一律地铁。',
  },
  {
    id: 'beijing',
    name: '北京',
    nameEn: 'Beijing',
    province: '北京',
    lat: 39.915,
    lng: 116.404,
    stateColor: '#A85A4E',
    stateColorName: '宫墙红',
    character: ['中轴线', '胡同', '鸽哨', '槐花', '干燥的风'],
    intro: '城是方的，路是正的，风从北边来，一路不停。',
    slogan: { title: '北京，慢慢走', sub: '在胡同与宫墙之间，等一场落日把角楼点亮。' },
    climate: { highC: 21, lowC: 9, note: '干燥多风，昼夜温差大，四月柳絮渐起' },
    themes: [
      {
        keys: ['书店', '书', '旧书', '阅读'],
        line: '斜街不肯走直，书页也不肯合上',
        en: 'Slanted Streets',
      },
      {
        keys: ['中轴', '城楼', '故宫', '历史'],
        line: '从永定门数到钟鼓楼，把城当一列书架',
        en: 'The Central Axis',
      },
      {
        keys: ['艺术', '美术馆', '798', '展览'],
        line: '厂房够高，正好挂住春天',
        en: 'Factory Ceilings',
      },
      {
        keys: ['湖', '什刹海', '夜', '酒吧'],
        line: '水面收走白天的声音',
        en: 'Water at Dusk',
      },
    ],
    palette: [
      { hex: '#A85A4E', name: '宫墙红', use: '围巾或帽子 · 一点就够' },
      { hex: '#C9B98F', name: '琉璃金', use: '配饰 · 屋檐反光的那种金' },
      { hex: '#2F3A4C', name: '青砖灰蓝', use: '外套 · 胡同墙的颜色' },
      { hex: '#E9E2D2', name: '汉白玉', use: '上衣 · 拍红墙最干净的底' },
      { hex: '#4A6FA5', name: '景山天青', use: '针织 · 从山上看到的那层雾' },
    ],
    outfit: {
      summary: {
        spring: '北京春天风是主角：中午能穿单衣，太阳一落就得把外套还回来。',
        summer: '北京夏天晒且偶有雷雨，中午躲晒，清早和傍晚才是走路的时间。',
        autumn: '北京秋天干爽，是全年最好走的季节，早晚温差大记得加件外套。',
        winter: '北京冬天干冷风硬，帽子围巾比厚外套更顶用，进屋好脱的穿法最省心。',
      },
      items: [
        { piece: '防风外套', detail: '风衣或冲锋衣，挡住中轴线上的穿堂风' },
        { piece: '薄内层', detail: '羊绒或抓绒，早晚套上' },
        { piece: '围巾或纱巾', detail: '既挡风也挡柳絮' },
        { piece: '能走路的鞋', detail: '中轴线全长 7.8 公里，别高估自己' },
        { piece: '润唇膏', detail: '干燥是北方春天的底色' },
      ],
    },
    transport: '地铁加骑行最顺手；胡同区一律步行，车进不去。',
  },
  {
    id: 'suzhou',
    name: '苏州',
    nameEn: 'Suzhou',
    province: '江苏',
    lat: 31.311,
    lng: 120.617,
    stateColor: '#6E968C',
    stateColorName: '园林黛青',
    character: ['园林', '评弹', '水巷', '粉墙黛瓦', '手艺人'],
    intro: '园子是叠出来的山水，巷子是摊开的评弹。',
    slogan: { title: '苏州，慢慢走', sub: '在园子与评弹之间，把两天走成一句吴侬软语。' },
    climate: { highC: 20, lowC: 12, note: '春雨多，青苔和评弹一样润' },
    themes: [
      {
        keys: ['园林', '拙政园', '狮子林', '艺圃'],
        line: '一天只看两个园子，剩下的时间坐着听雨',
        en: 'Two Gardens a Day',
      },
      {
        keys: ['评弹', '平江路', '曲', '听书'],
        line: '三弦一响，石板路就慢了半拍',
        en: 'Piping & Strings',
      },
      {
        keys: ['船', '山塘', '水', '游船'],
        line: '摇船的人不看风景，看水路',
        en: 'Rowing Slow',
      },
      {
        keys: ['博物馆', '苏博', '建筑', '贝聿铭'],
        line: '片石假山，是用墙画的画',
        en: 'Stone on a Wall',
      },
    ],
    palette: [
      { hex: '#6E968C', name: '黛青', use: '丝巾 · 园子里的水色' },
      { hex: '#E5DED0', name: '粉墙', use: '上衣 · 一身浅色站在墙前最好看' },
      { hex: '#3D4652', name: '黛瓦', use: '外套或裤 · 瓦当的深灰蓝' },
      { hex: '#B07148', name: '苏式朱漆', use: '小配饰 · 亭子里的那点红棕' },
      { hex: '#9FB98A', name: '苔绿', use: '针织 · 太湖石缝里的颜色' },
    ],
    outfit: {
      summary: {
        spring: '苏州春天主打"润"：雨说下就下，鞋比伞更重要。',
        summer: '苏州夏天闷热，园林里树荫多，走路挑早晚，中午交给茶馆。',
        autumn: '苏州秋天秋高气爽，粉墙黛瓦在天光下最出片，早晚备件薄外套。',
        winter: '苏州冬天湿冷，园子人少景静，穿暖走慢才是对的节奏。',
      },
      items: [
        { piece: '防雨外套或伞', detail: '二选一，伞在园林里更出片' },
        { piece: '浅色棉麻', detail: '粉墙黛瓦前的干净底色' },
        { piece: '防滑的鞋', detail: '雨天石板路滑，鞋底要认真挑' },
        { piece: '丝巾', detail: '评弹馆和园林框景都好用' },
      ],
    },
    transport: '古城内步行加三轮车；园林之间打车十五分钟内。',
  },
  {
    id: 'hangzhou',
    name: '杭州',
    nameEn: 'Hangzhou',
    province: '浙江',
    lat: 30.259,
    lng: 120.145,
    stateColor: '#5E9184',
    stateColorName: '龙井青',
    character: ['西湖', '茶山', '运河', '南山路', '雨后山气'],
    intro: '湖是城的心事，茶是山的语言。',
    slogan: { title: '杭州，慢慢走', sub: '在西湖与茶山之间，一盏茶的时间刚刚好。' },
    climate: { highC: 22, lowC: 12, note: '明前茶季刚过，雨后山里全是水汽' },
    themes: [
      {
        keys: ['西湖', '苏堤', '断桥', '湖'],
        line: '断桥不断，长桥不长，故事都比名字诚实',
        en: 'Honest Names',
      },
      {
        keys: ['茶', '龙井', '茶园', '梅家坞'],
        line: '从村里往山上走，一杯茶变成一整个下午',
        en: 'Up the Terrace',
      },
      {
        keys: ['运河', '桥西', '拱宸桥', '船'],
        line: '拱宸桥下，船比车慢',
        en: 'Canal Time',
      },
      {
        keys: ['美术馆', '美院', '南山路', '艺术'],
        line: '中国美院的墙外，梧桐比画还满',
        en: 'Green Wall',
      },
    ],
    palette: [
      { hex: '#5E9184', name: '龙井青', use: '外套 · 茶山最深处的那层绿' },
      { hex: '#9DBF9E', name: '茶园雾绿', use: '上衣 · 雨后的坡地' },
      { hex: '#3E5C76', name: '湖心蓝', use: '裤或包 · 船开过去的水痕' },
      { hex: '#BE9D5F', name: '佛顶金', use: '配饰 · 灵隐的香与檐' },
      { hex: '#E8EDE6', name: '雾白', use: '内搭 · 山里拍照的留白' },
    ],
    outfit: {
      summary: {
        spring: '杭州春天要同时准备"爬山"和"淋雨"：山里比湖边凉，雨比预报勤。',
        summer: '杭州夏天湿热，湖边日头毒，湖留给清早和傍晚，白天躲进山里林荫。',
        autumn: '杭州秋天桂花满城，湖边山里都干爽好走，早晚备件薄外套。',
        winter: '杭州冬天湿冷，湖上风大，围巾比想象中重要。',
      },
      items: [
        { piece: '速干内层', detail: '爬茶山出汗快，棉的会一直潮着' },
        { piece: '轻防雨外套', detail: '湖边山里说下就下' },
        { piece: '防滑徒步鞋', detail: '龙井村到杨梅岭的坡是石阶' },
        { piece: '遮阳帽', detail: '茶山没遮挡，晒人的时段记得戴上' },
      ],
    },
    transport: '景区间公交加步行；环湖骑行使共享单车最方便。',
  },
  {
    id: 'wuxi',
    name: '无锡',
    nameEn: 'Wuxi',
    province: '江苏',
    lat: 31.566,
    lng: 120.3,
    stateColor: '#7A96B8',
    stateColorName: '太湖蓝',
    character: ['太湖', '祠堂', '樱瓣', '石桥', '江南书场'],
    intro: '太湖把天借给水，樱花开完，春天才开始长。',
    slogan: { title: '无锡，慢慢走', sub: '在太湖与樱花之间，跟着桨声把日子过慢。' },
    climate: { highC: 20, lowC: 11, note: '湖边风大，鼋头渚樱花进入尾声' },
    themes: [
      {
        keys: ['太湖', '鼋头渚', '樱花', '湖'],
        line: '花瓣落在游船的轨迹里，水比花先动',
        en: 'Lake Tail',
      },
      {
        keys: ['祠堂', '惠山', '古镇', '泥人'],
        line: '一百多座祠堂，像一部按姓氏排的目录',
        en: 'Hall of Names',
      },
      {
        keys: ['运河', '清名桥', '南长街', '夜'],
        line: '桥是石头的，夜是水做的',
        en: 'Stone & Water',
      },
      {
        keys: ['书院', '东林', '读书', '历史'],
        line: '风声雨声，现在只剩风声',
        en: 'Wind Only',
      },
    ],
    palette: [
      { hex: '#7A96B8', name: '太湖蓝', use: '外套 · 湖面那种偏灰的蓝' },
      { hex: '#D9B8C4', name: '樱贝', use: '围巾 · 落在肩上的那瓣' },
      { hex: '#6E7B8A', name: '石桥灰', use: '裤 · 清名桥的石头' },
      { hex: '#EAE4D6', name: '粉墙米', use: '上衣 · 惠山古镇的墙' },
      { hex: '#2C3A47', name: '夜航墨', use: '包 · 江南夜里的水色' },
    ],
    outfit: {
      summary: {
        spring: '无锡春天湖边比城里低三度，一件防风外套全程不亏。',
        summer: '无锡夏天湖边晒，环湖要防晒补水，尽量把湖安排在清早。',
        autumn: '无锡秋天湖光干净、天高云淡，是最好的环湖季节。',
        winter: '无锡冬天湿冷，湖边风比城里硬，防风保暖放在第一位。',
      },
      items: [
        { piece: '防风外套', detail: '太湖上没有遮挡，风是直的' },
        { piece: '叠穿针织', detail: '古镇逛吃和登船之间温差明显' },
        { piece: '舒适的鞋', detail: '惠山古镇到锡惠公园全是坡和石阶' },
        { piece: '备用电池', detail: '拍水拍桥，掉电比平时快' },
      ],
    },
    transport: '地铁一号线串起南长街与太湖广场；鼋头渚有专线公交。',
  },
  {
    id: 'puer',
    name: '普洱',
    nameEn: "Pu'er",
    province: '云南',
    lat: 22.786,
    lng: 100.977,
    stateColor: '#7A9E4F',
    stateColorName: '茶山苔绿',
    character: ['茶山', '茶马古道', '火塘', '雨林边缘', '慢'],
    intro: '茶山把时间泡得很慢，慢到一饼茶要等十年。',
    slogan: { title: '普洱，慢慢走', sub: '在茶山与云雾之间，等一饼茶慢慢变老。' },
    climate: { highC: 28, lowC: 15, note: '旱季尾声，紫外线强，茶山早晚凉' },
    themes: [
      {
        keys: ['茶', '茶山', '茶园', '压茶'],
        line: '亲手压一块茶饼，寄给三个月后的自己',
        en: 'Press Your Own',
      },
      {
        keys: ['古道', '那柯里', '马帮', '徒步'],
        line: '那柯里的石板路上，马蹄印比字更早',
        en: 'Hoofprints First',
      },
      {
        keys: ['夜市', '火塘', '烤茶', '夜'],
        line: '烤茶的第一泡，是给火的',
        en: 'First Pour',
      },
      {
        keys: ['咖啡', '庄园', '小粒咖啡'],
        line: '北回归线上，茶和咖啡住在同一座山',
        en: 'Tea & Coffee',
      },
    ],
    palette: [
      { hex: '#7A9E4F', name: '苔绿', use: '外套 · 茶山行走的保护色' },
      { hex: '#8C5A3C', name: '茶汤褐', use: '包或鞋 · 老生茶的汤色' },
      { hex: '#E7DFC9', name: '米汤白', use: '内搭 · 粗陶的颜色' },
      { hex: '#3C4A3A', name: '雨林墨', use: '裤 · 林子深处的绿黑' },
      { hex: '#B8864A', name: '火塘橙', use: '帽子 · 烤茶时的那点火光' },
    ],
    outfit: {
      summary: {
        spring: '普洱春天是"一山有四季"：城区短袖，茶山早晚要加抓绒。',
        summer: '普洱夏天是雨季，午后阵雨说下就下，防水比防晒更要紧。',
        autumn: '普洱秋天雨收云开，城区短袖、茶山早晚凉，叠穿最稳。',
        winter: '普洱冬天是旱季，白天暖和早晚凉，昼夜温差大要叠穿。',
      },
      items: [
        { piece: '透气长袖', detail: '防晒加防蚊，比短袖实用' },
        { piece: '抓绒或薄羽绒', detail: '上茶山看日出必备' },
        { piece: '徒步鞋', detail: '茶山土路雨后粘脚' },
        { piece: '防晒帽与墨镜', detail: '海拔一千三，紫外线不讲道理' },
        { piece: '驱蚊液', detail: '雨林边缘，傍晚最勤快' },
      ],
    },
    transport: '城区小而散，打车加包车；去茶山和那柯里建议包车半天。',
  },
  {
    id: 'xishuangbanna',
    name: '西双版纳',
    nameEn: 'Xishuangbanna',
    province: '云南',
    lat: 22.009,
    lng: 100.798,
    stateColor: '#55876B',
    stateColorName: '雨林绿',
    character: ['澜沧江', '佛塔', '夜市', '傣锦', '泼水节'],
    intro: '下午六点，太阳把佛塔镀成金的，夜市才开始醒。',
    slogan: { title: '版纳，慢慢走', sub: '在雨林与澜沧江之间，等太阳把佛塔镀成金。' },
    climate: { highC: 33, lowC: 19, note: '四月是一年最热的时候之一，紫外线极强，泼水节在 4 月中旬' },
    themes: [
      {
        keys: ['夜市', '星光', '告庄', '夜'],
        line: '星光夜市亮起来，澜沧江就换了一副嗓子',
        en: 'Star Market',
      },
      {
        keys: ['佛寺', '大金塔', '曼听', '傣装'],
        line: '曼听的总佛寺，金顶在树冠上面',
        en: 'Above the Canopy',
      },
      {
        keys: ['植物园', '雨林', '王莲', '绿石林'],
        line: '王莲能坐住一个小孩，走完西区要三小时',
        en: 'Giant Lily',
      },
      {
        keys: ['江边', '滨江', '散步'],
        line: '江风把白天的高温一点一点退回去',
        en: 'River Breeze',
      },
    ],
    palette: [
      { hex: '#55876B', name: '雨林绿', use: '防晒衣 · 融进树冠里' },
      { hex: '#C2A05C', name: '佛塔金', use: '配饰 · 大金塔的檐' },
      { hex: '#A05C42', name: '织锦红棕', use: '包 · 傣锦的经纬' },
      { hex: '#F2EAD3', name: '象牙白', use: '上衣 · 最扛晒也最出片' },
      { hex: '#22423A', name: '深林墨', use: '裤 · 雨林背光处' },
    ],
    outfit: {
      summary: {
        spring: '版纳四五月最热，防晒是头等大事，白天 33°C 不是开玩笑。',
        summer: '版纳夏天是雨季，午后阵雨说来就来，伞和防蚊液都要带。',
        autumn: '版纳秋天雨季收尾，白天晒、傍晚才有风，防晒别松懈。',
        winter: '版纳冬天是黄金季节：白天 26°C 上下，早晚 12°C 出头，怎么走都舒服。',
      },
      items: [
        { piece: '速干短袖', detail: '一天换两件也不夸张' },
        { piece: 'UPF 防晒衣', detail: '比防晒霜可靠，佛寺进殿也要遮肩' },
        { piece: '遮阳帽与墨镜', detail: '正午太阳直射，帽子是刚需' },
        { piece: '凉鞋或速干鞋', detail: '泼水节前后，全城都是水' },
        { piece: '驱蚊液', detail: '夜市和植物园都用得上' },
      ],
    },
    transport: '景洪城区打车便宜；去勐仑植物园坐城际班车或包车。',
  },
  {
    id: 'dali',
    name: '大理',
    nameEn: 'Dali',
    province: '云南',
    lat: 25.6065,
    lng: 100.2676,
    stateColor: '#7E93A8',
    stateColorName: '苍山雾蓝',
    character: ['苍山', '洱海', '白族院落', '扎染', '风吹'],
    intro: '风把洱海吹出两种颜色，也把一天分成山上和海边。',
    slogan: { title: '大理，慢慢走', sub: '在苍山与洱海之间，把一天走成两种风。' },
    climate: { highC: 22.8, lowC: 10.2, note: '旱季尾声、日照长，湖畔风大，早晚温差近 13 度' },
    themes: [
      {
        keys: ['洱海', '海', '环海', '骑行'],
        line: '绕海一圈太满，不如只走一段，等风来',
        en: 'One Shore Only',
      },
      {
        keys: ['苍山', '爬山', '徒步', '山'],
        line: '苍山十九峰，认得出名字的只有对面那一座',
        en: 'Nineteen Peaks',
      },
      {
        keys: ['扎染', '手作', '周城', '蓝'],
        line: '板蓝根染出来的蓝，要先被风吹干才算数',
        en: 'Indigo Wind',
      },
      {
        keys: ['古镇', '古城', '喜洲', '双廊'],
        line: '白族的院子把天围成一块方的，留给云',
        en: 'Square of Sky',
      },
      {
        keys: ['咖啡', '咖啡馆', '晒太阳'],
        line: '在洱海边把一杯咖啡喝到凉，是这里正经的日程',
        en: 'Coffee, Slow',
      },
    ],
    palette: [
      { hex: '#7E93A8', name: '苍山雾蓝', use: '外套主色 · 清晨苍山的雾层' },
      { hex: '#2F4F52', name: '洱海深青', use: '裤 / 包 · 午后被风吹皱的水面' },
      { hex: '#F2EFE6', name: '照壁白', use: '上衣 · 白族院墙的白' },
      { hex: '#3B5A78', name: '扎染靛', use: '围巾 · 周城染缸里的靛蓝' },
      { hex: '#C9A96A', name: '麦田金', use: '配饰 · 喜洲十月收割前的稻田' },
    ],
    outfit: {
      summary: {
        spring: '大理春天风最大：白天单件长袖就够，太阳一落就要加外套。',
        summer: '大理夏天是雨季，雨来得急停得也快，随身带轻薄雨衣比伞好用。',
        autumn: '大理秋天最舒服，白天晒得暖、湖边风凉，长袖加薄外套刚好。',
        winter: '大理冬天昼夜温差近 15 度，白天晒太阳穿单衣，早晚必须羽绒。',
      },
      items: [
        { piece: '防风外套', detail: '下关风与洱海风是真风，不是营销词' },
        { piece: '墨镜与宽檐帽', detail: '海拔两千，紫外线比气温更值得防' },
        { piece: '轻薄雨衣', detail: '山上和湖边都挡得住，比伞方便' },
        { piece: '润唇膏与保湿霜', detail: '旱季空气很干，嘴唇最先抗议' },
        { piece: '能走的鞋', detail: '古城石板与环海步道都很磨脚' },
      ],
    },
    transport: '古城与海西打车方便；环洱海建议包车或租车半天，电动车适合短段代步。',
  },
  {
    id: 'tengchong',
    name: '腾冲',
    nameEn: 'Tengchong',
    province: '云南',
    lat: 25.0204,
    lng: 98.491,
    stateColor: '#8A6E4B',
    stateColorName: '火山岩褐',
    character: ['火山', '温泉', '和顺侨乡', '银杏', '极边'],
    intro: '火山把大地烧过一次，温泉替它一直道歉。',
    slogan: { title: '腾冲，慢慢走', sub: '在火山与热海之间，把一天泡进雾里。' },
    climate: { highC: 23.2, lowC: 10.4, note: '四月进入雨季前段，城区温暖，和顺早晚偏凉' },
    themes: [
      {
        keys: ['温泉', '泡汤', '热海', '硫磺'],
        line: '大滚锅的水是滚的，泡进去的人却慢下来',
        en: 'Boiling, Slowly',
      },
      {
        keys: ['古镇', '和顺', '侨乡', '图书馆'],
        line: '村里最大的房子是图书馆，这件事值得出一趟远门',
        en: 'Library First',
      },
      {
        keys: ['火山', '地质', '热气球', '徒步'],
        line: '十山九无头，山自己忘了自己的顶',
        en: 'Headless Hills',
      },
      {
        keys: ['银杏', '秋天', '村'],
        line: '银杏村的秋天不是季节，是一场约好的重逢',
        en: 'Golden Village',
      },
      {
        keys: ['抗战', '远征军', '历史', '国殇'],
        line: '国殇墓园里没有喧哗，只有名字排成行',
        en: 'Names in Rows',
      },
    ],
    palette: [
      { hex: '#8A6E4B', name: '火山岩褐', use: '外套 · 火山石砌的墙与路' },
      { hex: '#4A5A4F', name: '高黎贡墨绿', use: '裤 / 包 · 山里的常绿阔林' },
      { hex: '#E9E2D2', name: '和顺墙白', use: '内搭 · 侨乡老宅的照壁' },
      { hex: '#D6A743', name: '银杏金', use: '围巾 · 银杏村的十一月' },
      { hex: '#6E8B8E', name: '温泉雾青', use: '上衣 · 热海腾起的水汽' },
    ],
    outfit: {
      summary: {
        spring: '腾冲春天多雨，白天暖、山里凉，带防水外套最实用。',
        summer: '腾冲雨季降水集中，出门必带雨具，泡温泉反而更配雨天。',
        autumn: '腾冲秋天最好，日间温暖干燥，看银杏要加一件外套。',
        winter: '腾冲冬天不算冷但要防湿，羽绒加防水外层是正解。',
      },
      items: [
        { piece: '防水外套', detail: '雨季与温泉两头都用得上' },
        { piece: '速干衣', detail: '泡完温泉不想穿着湿衣服回房间' },
        { piece: '防滑鞋', detail: '火山石路面与湿地栈道都偏滑' },
        { piece: '泳衣与防水袋', detail: '热海、柏联、悦椿都要用' },
        { piece: '薄羽绒', detail: '和顺古镇的清晨比城区低好几度' },
      ],
    },
    transport: '景点分散在城区、和顺、火山、北海几个方向，建议包车一天；去银杏村必须自驾或包车。',
  },
  {
    id: 'lijiang',
    name: '丽江',
    nameEn: 'Lijiang',
    province: '云南',
    lat: 26.855,
    lng: 100.2278,
    stateColor: '#6E7F9B',
    stateColorName: '雪山晴蓝',
    character: ['玉龙雪山', '纳西院落', '茶马古道', '水系', '日照金山'],
    intro: '雪山的雪没化过，古城的河却每天都在换水。',
    slogan: { title: '丽江，慢慢走', sub: '在雪山与四方街之间，把一天走成一条水。' },
    climate: { highC: 20.2, lowC: 8.3, note: '海拔 2400 米上下，空气干、日照强，昼夜温差大' },
    themes: [
      {
        keys: ['雪山', '玉龙', '日照金山', '冰川'],
        line: '雪山每天亮一次，只看你有没有起得来',
        en: 'Golden Morning',
      },
      {
        keys: ['古镇', '古城', '四方街', '束河', '白沙'],
        line: '三个古镇三种安静，白沙是最先安静下来的那个',
        en: 'Three Old Towns',
      },
      {
        keys: ['纳西', '东巴', '文化', '木府'],
        line: '木府的柱子比史书厚，东巴的字比故事老',
        en: 'Dongba & Mu',
      },
      {
        keys: ['骑马上山', '茶马古道', '马帮'],
        line: '茶马古道的马蹄声，被石板记住了几百年',
        en: 'Tea & Horses',
      },
      {
        keys: ['咖啡', '晒太阳', '院子'],
        line: '在院子里坐着不动，是丽江最贵的行程',
        en: 'Sit Still',
      },
    ],
    palette: [
      { hex: '#6E7F9B', name: '雪山晴蓝', use: '外套主色 · 无云的雪山天顶' },
      { hex: '#2E3A4A', name: '夜色深蓝', use: '裤 / 包 · 四方街入夜后的天' },
      { hex: '#EFE9DA', name: '纳西墙白', use: '上衣 · 古城的白墙' },
      { hex: '#8C5A3C', name: '木府木褐', use: '鞋 / 腰带 · 木府的梁柱' },
      { hex: '#B8453C', name: '东巴朱红', use: '围巾点缀 · 东巴木牌上的红' },
    ],
    outfit: {
      summary: {
        spring: '丽江春天干燥多风，白天暖、影子一落就凉，外套要随时能穿脱。',
        summer: '丽江夏天是雨季，白天短袖、雨后骤凉，防晒和雨具一起带。',
        autumn: '丽江秋天能见度最好，是看雪山的主季，早晚要加厚外套。',
        winter: '丽江冬天晴冷，白天晒太阳像春天，早晚暖气不够，羽绒刚需。',
      },
      items: [
        { piece: '薄羽绒或抓绒', detail: '上玉龙雪山与早晚出门都要' },
        { piece: '高倍防晒', detail: '海拔两千四，晒黑只要半天' },
        { piece: '润唇膏与保湿', detail: '干到你怀疑是不是同一张脸' },
        { piece: '舒适徒步鞋', detail: '古城石板与蓝月谷栈道都磨鞋' },
        { piece: '氧气瓶', detail: '上大索道前买，山上更贵也更难买' },
      ],
    },
    transport: '古城与束河之间打车或公交；玉龙雪山建议报一日或包车（门票与大索道要提前约）。',
  },
  {
    id: 'xian',
    name: '西安',
    nameEn: "Xi'an",
    province: '陕西',
    lat: 34.256,
    lng: 108.941,
    stateColor: '#B8864A',
    stateColorName: '唐三彩赭金',
    character: ['城墙', '碑刻', '顺城巷', '秦腔', '麦香'],
    intro: '城墙圈住的不是历史，是历史还在过的生活。',
    slogan: { title: '西安，慢慢走', sub: '在城墙与市井之间，走一步就跨过一千年。' },
    climate: { highC: 21, lowC: 9, note: '干燥，风里偶尔带沙，早晚温差大' },
    themes: [
      {
        keys: ['城墙', '骑行', '顺城巷'],
        line: '骑完一圈十三公里，城就变成一个圆',
        en: 'One Circle',
      },
      {
        keys: ['碑林', '书法', '字', '碑帖'],
        line: '石头上的字，比纸上的活得久',
        en: 'Stone Letters',
      },
      {
        keys: ['书院门', '德福巷', '老菜场', '街巷'],
        line: '城墙根下，写字的人比游客安静',
        en: 'Quiet Writers',
      },
      {
        keys: ['回民街', '小吃', '夜', '面'],
        line: '一勺油泼辣子，是这座城的标点符号',
        en: 'Chili Punctuation',
      },
    ],
    palette: [
      { hex: '#B8864A', name: '赭金', use: '外套 · 唐三彩的釉色' },
      { hex: '#9E4A3A', name: '陶俑红', use: '围巾 · 出土陶衣的颜色' },
      { hex: '#5C5346', name: '城砖灰褐', use: '裤 · 明城墙的砖' },
      { hex: '#EADFC8', name: '碑石米', use: '上衣 · 拓片留白处' },
      { hex: '#3E4A5C', name: '暮色青', use: '针织 · 城楼亮灯前那几分钟' },
    ],
    outfit: {
      summary: {
        spring: '西安春天干燥且温差大：一件能随时脱的外套，比穿得厚更重要。',
        summer: '西安夏天暴晒又闷，城墙和俑坑都少遮挡，防晒补水带足。',
        autumn: '西安秋天干爽，是最好走的季节，早晚偏凉要加外套。',
        winter: '西安冬天干冷风硬，城墙上的风更不讲情面，帽子围巾用得上。',
      },
      items: [
        { piece: '可脱卸外套', detail: '早晚九度，中午二十一度' },
        { piece: '薄围巾', detail: '挡风沙，进博物馆也能护住脖子' },
        { piece: '抓地好的鞋', detail: '城墙骑行不磨脚，顺城巷是砖地' },
        { piece: '护唇膏', detail: '干燥是西北春天的底色' },
      ],
    },
    transport: '城墙内地铁加步行；骑行一圈城墙约 100 分钟，记得带手套。',
  },
  {
    id: 'quanzhou',
    name: '泉州',
    nameEn: 'Quanzhou',
    province: '福建',
    lat: 24.911,
    lng: 118.59,
    stateColor: '#BC704F',
    stateColorName: '胭脂红砖',
    character: ['海丝', '红砖厝', '簪花', '木偶', '面线糊'],
    intro: '半城烟火半城仙，石头都在讲海上来的故事。',
    slogan: { title: '泉州，慢慢走', sub: '在红砖与海风之间，半城烟火半城仙。' },
    climate: { highC: 25, lowC: 17, note: '回南天尾梢，潮湿，约 8 个雨天' },
    themes: [
      {
        keys: ['开元寺', '东西塔', '寺庙', '海丝'],
        line: '东西塔看了一千年船来船往，姿势没换过',
        en: 'Thousand-Year Watch',
      },
      {
        keys: ['簪花', '蟳埔', '渔村', '拍照'],
        line: '蚵壳厝的墙里，有从远方漂来的贝壳',
        en: 'Oyster Walls',
      },
      {
        keys: ['洛阳桥', '潮水', '滩涂', '桥'],
        line: '退潮时下滩涂，桥才露出它的腿',
        en: 'Low Tide',
      },
      {
        keys: ['木偶', '提线', '南音', '戏'],
        line: '一个角色三十条线，泡茶的手不能抖',
        en: 'Thirty Strings',
      },
    ],
    palette: [
      { hex: '#BC704F', name: '胭脂红砖', use: '上衣 · 出片底色，和红砖墙同框' },
      { hex: '#E8D8C3', name: '蚵壳白', use: '外套 · 蚵壳厝的墙' },
      { hex: '#4E7A8A', name: '海丝青', use: '裤 · 港口退潮后的水色' },
      { hex: '#6E5A4A', name: '老杉褐', use: '包 · 庙里木构件的深棕' },
      { hex: '#2E3A48', name: '夜潮墨', use: '针织 · 夜里涨潮的钟楼' },
    ],
    outfit: {
      summary: {
        spring: '泉州春天潮热，回南天里穿得越素越配红砖与蚵壳墙。',
        summer: '泉州夏天日头毒且闷，老城遮荫少，赶早出门、水随身带。',
        autumn: '泉州秋天海风干爽，是逛老城最好的季节，早晚备件薄衫。',
        winter: '泉州冬天温和，白天短袖也常见，海边风大备件防风外套。',
      },
      items: [
        { piece: '透气速干衣', detail: '潮热天，棉的贴在身上不舒服' },
        { piece: '轻雨具', detail: '雨短但急，伞比雨衣实用' },
        { piece: '防滑鞋', detail: '洛阳桥退潮后的石面很滑' },
        { piece: '一件纯色上衣', detail: '簪花拍照时和花围不打架' },
      ],
    },
    transport: '古城内步行加"小白"电瓶车（2 元招手停）；蟳埔与洛阳桥打车可达。',
  },
  {
    id: 'chengdu',
    name: '成都',
    nameEn: 'Chengdu',
    province: '四川',
    lat: 30.66,
    lng: 104.07,
    stateColor: '#8E6FB8',
    stateColorName: '蜀锦紫',
    character: ['盖碗茶', '竹林', '串串', '夜雨', '慢手艺'],
    intro: '这座城把「慢」做成了一门手艺。',
    slogan: { title: '成都，慢慢走', sub: '在茶馆与巷子之间，把「慢」过成一门手艺。' },
    climate: { highC: 24, lowC: 14, note: '多云，夜雨常来，白天走热、傍晚转凉' },
    themes: [
      {
        keys: ['熊猫', '基地', '大熊猫'],
        line: '七点半的熊猫基地，竹子比人先醒',
        en: 'Before the Crowds',
      },
      {
        keys: ['茶馆', '盖碗', '采耳', '竹椅'],
        line: '盖碗茶续三次水，才算坐进了成都',
        en: 'Three Refills',
      },
      {
        keys: ['河', '望平街', '猛追湾', '书店'],
        line: '锦江边的旧厂房，现在卖咖啡和书',
        en: 'Riverfront Books',
      },
      {
        keys: ['串串', '火锅', '玉林', '夜'],
        line: '玉林的小桌上，签子堆成小山',
        en: 'Skewer Hill',
      },
    ],
    palette: [
      { hex: '#8E6FB8', name: '蜀锦紫', use: '外套 · 织锦里最深的那种紫' },
      { hex: '#5E9C68', name: '竹青', use: '上衣 · 熊猫基地的竹林' },
      { hex: '#BE9D5F', name: '盖碗铜', use: '配饰 · 茶馆的黄铜长嘴壶' },
      { hex: '#EFE7D8', name: '茶汤米', use: '内搭 · 头道茶的浅金' },
      { hex: '#37414F', name: '夜雨青', use: '裤 · 巷子里刚下过雨的石板' },
    ],
    outfit: {
      summary: {
        spring: '成都春天白天走得热、夜里落雨就凉，外套要随身带。',
        summer: '成都夏天闷热，夜雨多，白天逛吃挑阴凉走，傍晚出来正好。',
        autumn: '成都秋天多云转凉，夜雨依旧勤，外套随身最稳。',
        winter: '成都冬天湿冷少晴，室内室外一样凉，保暖要穿够再出门。',
      },
      items: [
        { piece: '薄外套', detail: '夜雨降温快，逛完夜市用得上' },
        { piece: '舒适的鞋', detail: '逛吃是一天的主旋律，两万步很正常' },
        { piece: '折叠伞', detail: '成都的雨多在夜里，但白天也不请假' },
        { piece: '一件亮色', detail: '巷子背景深，照片里需要一点亮' },
      ],
    },
    transport: '地铁加共享单车覆盖全城；熊猫基地赶早，地铁三号线转景区接驳。',
  },
];

export const CITY_BY_ID: Record<CityId, CityInfo> = Object.fromEntries(
  CITIES.map((c) => [c.id, c])
) as Record<CityId, CityInfo>;

export function getCity(id: string): CityInfo | undefined {
  return (CITY_BY_ID as Record<string, CityInfo | undefined>)[id];
}

/** 首页城市选择器的展示顺序 */
export const CITY_OPTIONS: Array<{ id: CityId; name: string; nameEn: string }> = CITIES.map(
  (c) => ({ id: c.id, name: c.name, nameEn: c.nameEn })
);

/*
 * 逐月常年气温（℃）：页面上的月份与温度随用户所在月份变化，不再固定展示四月。
 * 口径与上面的四月锚点一致：公开气候常年均值整理（中国气象数据网 1981–2010 /
 * Climate-Data 1991–2021 等），四舍五入取整。
 * 约束（测试守护）：每城第 4 列（四月）必须与该城 climate.highC/lowC 锚点完全一致；
 * 每月 high > low；最冷月落在 12/1/2 月，最热月落在 6/7/8 月。
 */
interface MonthTemp {
  hi: number;
  lo: number;
}

export const MONTHLY_CLIMATE: Record<CityId, MonthTemp[]> = {
  //           1月     2月     3月     4月     5月     6月     7月     8月     9月     10月    11月    12月
  shanghai: [
    { hi: 8, lo: 1 }, { hi: 10, lo: 3 }, { hi: 14, lo: 7 }, { hi: 20, lo: 12 },
    { hi: 25, lo: 18 }, { hi: 28, lo: 22 }, { hi: 33, lo: 26 }, { hi: 33, lo: 26 },
    { hi: 29, lo: 22 }, { hi: 23, lo: 16 }, { hi: 17, lo: 10 }, { hi: 11, lo: 4 },
  ],
  beijing: [
    { hi: 3, lo: -8 }, { hi: 6, lo: -5 }, { hi: 13, lo: 2 }, { hi: 21, lo: 9 },
    { hi: 27, lo: 15 }, { hi: 31, lo: 20 }, { hi: 32, lo: 23 }, { hi: 31, lo: 22 },
    { hi: 27, lo: 16 }, { hi: 19, lo: 9 }, { hi: 10, lo: 1 }, { hi: 3, lo: -6 },
  ],
  suzhou: [
    { hi: 8, lo: 2 }, { hi: 11, lo: 4 }, { hi: 15, lo: 8 }, { hi: 20, lo: 12 },
    { hi: 25, lo: 18 }, { hi: 28, lo: 22 }, { hi: 33, lo: 26 }, { hi: 32, lo: 26 },
    { hi: 28, lo: 21 }, { hi: 23, lo: 16 }, { hi: 17, lo: 9 }, { hi: 11, lo: 3 },
  ],
  hangzhou: [
    { hi: 9, lo: 2 }, { hi: 12, lo: 5 }, { hi: 16, lo: 9 }, { hi: 22, lo: 12 },
    { hi: 26, lo: 18 }, { hi: 29, lo: 22 }, { hi: 34, lo: 26 }, { hi: 33, lo: 25 },
    { hi: 29, lo: 21 }, { hi: 24, lo: 15 }, { hi: 18, lo: 9 }, { hi: 12, lo: 3 },
  ],
  wuxi: [
    { hi: 8, lo: 1 }, { hi: 11, lo: 4 }, { hi: 15, lo: 8 }, { hi: 20, lo: 11 },
    { hi: 25, lo: 17 }, { hi: 28, lo: 22 }, { hi: 33, lo: 26 }, { hi: 32, lo: 25 },
    { hi: 28, lo: 21 }, { hi: 23, lo: 15 }, { hi: 17, lo: 8 }, { hi: 11, lo: 2 },
  ],
  puer: [
    { hi: 22, lo: 8 }, { hi: 25, lo: 10 }, { hi: 28, lo: 13 }, { hi: 28, lo: 15 },
    { hi: 28, lo: 18 }, { hi: 27, lo: 20 }, { hi: 27, lo: 20 }, { hi: 27, lo: 19 },
    { hi: 26, lo: 18 }, { hi: 25, lo: 15 }, { hi: 22, lo: 11 }, { hi: 21, lo: 8 },
  ],
  xishuangbanna: [
    { hi: 26, lo: 12 }, { hi: 29, lo: 14 }, { hi: 32, lo: 17 }, { hi: 33, lo: 19 },
    { hi: 33, lo: 22 }, { hi: 31, lo: 23 }, { hi: 31, lo: 23 }, { hi: 31, lo: 23 },
    { hi: 30, lo: 22 }, { hi: 28, lo: 19 }, { hi: 27, lo: 15 }, { hi: 25, lo: 12 },
  ],
  // 大理：新浪天气·中国气象局历史气候（逐月均高/均低）
  dali: [
    { hi: 15.7, lo: 2.6 }, { hi: 17.1, lo: 4.3 }, { hi: 20.0, lo: 7.2 }, { hi: 22.8, lo: 10.2 },
    { hi: 24.6, lo: 13.6 }, { hi: 25.2, lo: 16.6 }, { hi: 24.7, lo: 16.8 }, { hi: 24.7, lo: 16.1 },
    { hi: 23.5, lo: 14.6 }, { hi: 21.5, lo: 12.1 }, { hi: 18.5, lo: 7.0 }, { hi: 16.0, lo: 3.2 },
  ],
  // 腾冲：中国气象局气象数据中心 1981–2010
  tengchong: [
    { hi: 16.6, lo: 2.3 }, { hi: 17.9, lo: 3.9 }, { hi: 21.2, lo: 6.9 }, { hi: 23.2, lo: 10.4 },
    { hi: 24.0, lo: 14.1 }, { hi: 23.7, lo: 17.4 }, { hi: 23.3, lo: 17.7 }, { hi: 24.6, lo: 17.6 },
    { hi: 24.3, lo: 16.4 }, { hi: 22.8, lo: 13.2 }, { hi: 19.9, lo: 7.9 }, { hi: 17.3, lo: 3.8 },
  ],
  // 丽江：中国气象局 1981–2010
  lijiang: [
    { hi: 14.0, lo: 0.3 }, { hi: 15.0, lo: 2.5 }, { hi: 17.3, lo: 5.4 }, { hi: 20.2, lo: 8.3 },
    { hi: 22.9, lo: 11.3 }, { hi: 24.1, lo: 14.5 }, { hi: 23.3, lo: 14.8 }, { hi: 22.9, lo: 14.0 },
    { hi: 21.4, lo: 12.4 }, { hi: 20.2, lo: 8.9 }, { hi: 17.1, lo: 3.7 }, { hi: 14.6, lo: 0.3 },
  ],
  xian: [
    { hi: 5, lo: -4 }, { hi: 9, lo: -1 }, { hi: 15, lo: 5 }, { hi: 21, lo: 9 },
    { hi: 27, lo: 13 }, { hi: 32, lo: 18 }, { hi: 33, lo: 22 }, { hi: 31, lo: 21 },
    { hi: 26, lo: 16 }, { hi: 19, lo: 10 }, { hi: 11, lo: 3 }, { hi: 5, lo: -3 },
  ],
  quanzhou: [
    { hi: 16, lo: 9 }, { hi: 17, lo: 10 }, { hi: 20, lo: 13 }, { hi: 25, lo: 17 },
    { hi: 27, lo: 21 }, { hi: 30, lo: 24 }, { hi: 33, lo: 26 }, { hi: 33, lo: 26 },
    { hi: 31, lo: 24 }, { hi: 28, lo: 20 }, { hi: 23, lo: 15 }, { hi: 18, lo: 10 },
  ],
  chengdu: [
    { hi: 11, lo: 3 }, { hi: 13, lo: 6 }, { hi: 18, lo: 10 }, { hi: 24, lo: 14 },
    { hi: 27, lo: 18 }, { hi: 29, lo: 21 }, { hi: 31, lo: 23 }, { hi: 31, lo: 23 },
    { hi: 26, lo: 19 }, { hi: 21, lo: 15 }, { hi: 16, lo: 10 }, { hi: 11, lo: 5 },
  ],
};

export interface MonthClimate {
  /** 1–12 */
  month: number;
  highC: number;
  lowC: number;
}

/** 某城某月（1–12）的常年气温；越界月份收敛到 1 / 12，不抛错 */
export function climateOfMonth(city: CityInfo, month1to12: number): MonthClimate {
  const m = Math.min(12, Math.max(1, Math.round(month1to12) || 1));
  const row = MONTHLY_CLIMATE[city.id][m - 1]!;
  return { month: m, highC: row.hi, lowC: row.lo };
}

/** 用户现在所在的月份（1–12），页面月份标签随它走 */
export function currentMonth(): number {
  return new Date().getMonth() + 1;
}
