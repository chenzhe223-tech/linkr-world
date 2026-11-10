// Link-R World — 地图栏统一入口
//
// 这里只做一件事：把行程数据翻译成 ChinaMap 的节点状态，然后渲染自研中国地图。
//
// 为什么不再走「在线底图 → 失败回退示意图」：那条链路里的在线底图需要 Key、外网和
// WebGL，任何一环缺失地图栏就只剩一行原因提示或空白；而自研地图用的是随包发布的
// 标准边界数据 + SVG，本地单文件打开、断网、导出 PNG 都能渲染，没有可失败的外部依赖。
// 真要失败只会是「边界数据没打进来」，此时 ChinaMap 会显示明确的降级说明，不留空白。
//
// 节点状态口径（与底部图例一一对应）：
//   current  = 当前选中的行程块；visited = 选中日之前的日期；planned = 之后的日期；
//   start    = 全程第一个地点；end = 全程最后一个地点；没有坐标的地点不硬放，脚注提示。

import { useMemo } from 'react';
import type { Trip } from '../lib/types';
import { placesInTrip, placesNotInTrip } from '../lib/tripMath';
import { ChinaMap, type MapPinState, type MapPlace } from './ChinaMap';

interface TripMapProps {
  trip: Trip;
  selectedDay: number;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  /** 城市名：主图若是局部放大，图上要标出这是哪座城 */
  focusLabel?: string;
}

export function TripMap({ trip, selectedDay, selectedItemId, onSelectItem, focusLabel }: TripMapProps) {
  const { places, states } = useMemo(() => {
    const byId = new Map(
      placesInTrip(trip)
        .concat(placesNotInTrip(trip))
        .map((p) => [p.id, p])
    );
    // 按行程块顺序去重：地图上的编号 = 实际到访顺序
    const order: string[] = [];
    const itemState = new Map<string, MapPinState>();
    trip.items.forEach((it, idx) => {
      if (!order.includes(it.placeId)) order.push(it.placeId);
      const role: MapPinState =
        idx === 0 ? 'start' : idx === trip.items.length - 1 ? 'end' : 'planned';
      const cur = itemState.get(it.placeId);
      // 同一地点被排进多天时，取「当前 > 起终点 > 已到过 > 计划中」的优先级
      const rank: Record<MapPinState, number> = {
        current: 5,
        start: 4,
        end: 4,
        visited: 2,
        explore: 1,
        planned: 0,
      };
      if (!cur || rank[role] > rank[cur]) itemState.set(it.placeId, role);
    });

    const list: MapPlace[] = order
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((p) => ({ id: p!.id, name: p!.name, lat: p!.lat, lng: p!.lng, note: p!.kind }));

    const out: Record<string, MapPinState> = {};
    order.forEach((id) => {
      out[id] = itemState.get(id) ?? 'planned';
    });
    // 选中日 / 选中块覆盖：当前块高亮，选中日之前标为已到过，之后标为计划中
    trip.items.forEach((it) => {
      if (it.id === selectedItemId) {
        out[it.placeId] = 'current';
        return;
      }
      if (it.dayIndex < selectedDay && out[it.placeId] !== 'start' && out[it.placeId] !== 'end') {
        out[it.placeId] = 'visited';
      }
      if (it.dayIndex > selectedDay && out[it.placeId] !== 'start' && out[it.placeId] !== 'end') {
        out[it.placeId] = 'planned';
      }
    });
    return { places: list, states: out };
  }, [trip, selectedDay, selectedItemId]);

  const activeId = useMemo(() => {
    const it = trip.items.find((i) => i.id === selectedItemId);
    return it ? it.placeId : null;
  }, [trip, selectedItemId]);

  const day = trip.days[selectedDay];

  return (
    <div className="map-host" data-testid="trip-map">
      <ChinaMap
        places={places}
        states={states}
        activeId={activeId}
        onSelect={(placeId) => {
          // 点地图上的点 → 与左侧行程卡联动：优先选当天的块，否则选首个关联块
          const inDay = trip.items.find((i) => i.placeId === placeId && i.dayIndex === selectedDay);
          const any = trip.items.find((i) => i.placeId === placeId);
          const target = inDay ?? any;
          if (target) onSelectItem(target.id);
        }}
        caption={day ? `Day ${selectedDay + 1} · ${places.length} 个地点` : `${places.length} 个地点`}
        focusLabel={focusLabel}
        variant="workbench"
      />
    </div>
  );
}
