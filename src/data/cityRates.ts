// Link-R World — 城市消费费率（预算模型的输入之一）
//
// 区间为"舒适档"参考值（元），来源：主流预订与点评平台 2025–2026 年常见公开区间，
// 按城市消费水平取整。估算口径全部写在界面上，实时价格以预订平台为准。

import type { CityId } from './cities';

export interface CityRates {
  /** 住宿参考（元/晚·间，舒适档：干净连锁/好评民宿） */
  stayPerNight: [number, number];
  /** 餐饮参考（元/人·天：三餐 + 一杯茶饮/咖啡，舒适档） */
  mealPerDay: [number, number];
  /** 有民用机场 */
  hasAirport: boolean;
  /** 有直达 G/D 动车到发（多数东部出发地无需中转） */
  hasDirectRail: boolean;
  /** 交通接驳说明（无直飞/无直铁时显示） */
  transferNote?: string;
}

export const CITY_RATES: Record<CityId, CityRates> = {
  shanghai: { stayPerNight: [280, 620], mealPerDay: [80, 190], hasAirport: true, hasDirectRail: true },
  beijing: { stayPerNight: [270, 600], mealPerDay: [70, 170], hasAirport: true, hasDirectRail: true },
  suzhou: {
    stayPerNight: [240, 520],
    mealPerDay: [65, 150],
    hasAirport: false,
    hasDirectRail: true,
    transferNote: '苏州无民用机场，乘飞机需经上海（虹桥/浦东）或无锡（硕放）',
  },
  hangzhou: { stayPerNight: [270, 580], mealPerDay: [70, 165], hasAirport: true, hasDirectRail: true },
  wuxi: { stayPerNight: [230, 470], mealPerDay: [60, 140], hasAirport: true, hasDirectRail: true },
  puer: {
    stayPerNight: [130, 300],
    mealPerDay: [45, 110],
    hasAirport: true,
    hasDirectRail: false,
    transferNote: '普洱无高铁直达：飞机常经昆明中转；火车走中老铁路（昆明转动车约 2 小时）',
  },
  xishuangbanna: {
    stayPerNight: [150, 360],
    mealPerDay: [50, 120],
    hasAirport: true,
    hasDirectRail: false,
    transferNote: '西双版纳无高铁直达：飞机常经昆明中转；火车走中老铁路（昆明转动车约 3.5 小时）',
  },
  dali: {
    stayPerNight: [170, 400],
    mealPerDay: [55, 130],
    hasAirport: true,
    hasDirectRail: true,
    transferNote: '大理站有跨省直达动车（广州南 / 深圳北 / 南宁 / 成都东 / 重庆西），也可直飞大理荒草坝机场',
  },
  tengchong: {
    stayPerNight: [160, 380],
    mealPerDay: [50, 120],
    hasAirport: true,
    hasDirectRail: false,
    transferNote: '腾冲无铁路客运：动车到保山站后转汽车约 2.5 小时；直飞腾冲驼峰机场最省时',
  },
  lijiang: {
    stayPerNight: [180, 420],
    mealPerDay: [60, 140],
    hasAirport: true,
    hasDirectRail: false,
    transferNote: '丽江无跨省直达高铁：动车到昆明约 3.5 小时、到大理约 2 小时，东部出发多在昆明换乘；也可直飞丽江三义机场',
  },
  xian: { stayPerNight: [230, 500], mealPerDay: [60, 145], hasAirport: true, hasDirectRail: true },
  quanzhou: { stayPerNight: [210, 450], mealPerDay: [55, 135], hasAirport: true, hasDirectRail: true },
  chengdu: { stayPerNight: [250, 540], mealPerDay: [65, 155], hasAirport: true, hasDirectRail: true },
};
