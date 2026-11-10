// Link-R World — 透明费率（写在界面上，不做隐式推算）

export const TRIP_CURRENCY = '¥';

/** 舒适漫游上限（公里/天）。超过即提示"偏满"，用于节奏判断。 */
export const ROAM_COMFORT_KM_PER_DAY = 7;

/** 市内交通固定费率（元/段）。透明算术：写在界面上。 */
export const TRANSIT_RATE: Record<string, number> = {
  步行: 0,
  骑行: 0,
  公交: 2,
  地铁: 4,
  小白电瓶车: 2,
  城际班车: 30,
  包车: 150,
  网约车: 45,
  出租车: 45,
};
