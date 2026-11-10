// Link-R World — 行程骨架的共用类型
import type { CostCategory, TimeSlot } from '../lib/types';
import type { CityId } from './cities';

export interface ProgramItem {
  placeId: string;
  slot: TimeSlot;
  /** 展示时段，如 "09:30–11:15" */
  time: string;
  note: string;
  transit: { mode: string; minutes: number; needCheck?: boolean };
  /** 该行程块的额外花费（餐饮 / 购物 / 打车以外的杂项）；门票自动取自地点 ticket */
  cost: number;
  costCategory: CostCategory;
  roamKm?: number;
  relate?: { with: string; line: string };
}

export interface ProgramDay {
  theme: string;
  themeEn: string;
  pace: string;
}

export interface CityProgram {
  days: ProgramDay[];
  items: ProgramItem[];
}

/** 骨架分片表：东西两片各覆盖一部分城市，合并后即为全量 */
export type ProgramTable = Partial<Record<CityId, CityProgram>>;
