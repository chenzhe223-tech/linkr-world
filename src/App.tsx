import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader } from './brand/AppHeader';
import { Landing } from './components/Landing';
import { WorldMap, composeWish, type JourneyDraft } from './components/WorldMap';
import { TravelMood } from './components/TravelMood';
import { TripSummary } from './components/TripSummary';
import { JourneyClosure } from './components/JourneyClosure';
import { FareLedgerPanel } from './components/FareLedger';
import { buildFareLedger, type ManualFare } from './lib/fares';
import { ItineraryBoard } from './components/ItineraryBoard';
import { TripMap } from './components/TripMap';
import { TripPoster } from './components/TripPoster';
import { PlaceList } from './components/VerifiedPlaceList';
import { MemorySection } from './components/MemorySection';
import { StaySection } from './components/StaySection';
import { RhythmBand } from './components/RhythmBand';
import { ItemEditor, draftFromItem, emptyDraft, type EditorDraft } from './components/ItemEditor';
import { MemoryComposer } from './components/MemoryComposer';
import { MobileTabBar, type MobileTab } from './components/MobileTabBar';
import { EXAMPLE_PROMPT } from './components/TripPrompt';
import { createTrip, placeView, MAX_TRIP_DAYS } from './data/tripData';
import { CITY_BY_ID, CITIES, getCity, monthOfISO, type CityId } from './data/cities';
import { buildMood } from './lib/mood';
import {
  budgetSummary,
  dayItems,
  fiveRProgress,
  formatCNY,
  formatKm,
  fullBudget,
  parseDateFromInput,
  parseDaysFromInput,
  parseTierFromInput,
  summarizePrompt,
  type PromptSummary,
} from './lib/tripMath';
import { planIntercity } from './lib/transport';
import { buildLifecycle, humanDuration } from './lib/journey';
import { CITY_RATES } from './data/cityRates';
import { checkDateConsistency, type DateIssue } from './lib/consistency';
import type { ItineraryItem, MemoryEntry, Trip } from './lib/types';

/** 关闭动效偏好时，缩短模拟生成的等待 */
function preferReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function App() {
  const [cityId, setCityId] = useState<CityId>('shanghai');
  const city = getCity(cityId) ?? CITY_BY_ID.shanghai;

  // 出发地 / 出发日期（用户显式输入，驱动逐日行程）
  const [origin, setOrigin] = useState('');
  const [startDate, setStartDate] = useState('');
  /** 年龄（选填）：亲子 / 长辈出行时节奏自动放慢 */
  const [age, setAge] = useState('');
  const ageNum = useMemo(() => {
    const n = Number(age);
    return age.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= 99 ? n : undefined;
  }, [age]);

  const base = useMemo(() => createTrip(cityId), [cityId]);

  /** 首屏：世界地图游戏入口（默认）→ 传统表单（landing）→ 工作台（workbench） */
  const [view, setView] = useState<'worldmap' | 'landing' | 'workbench'>('worldmap');
  /** 窄屏 App 壳：一次只显示一栏（宽屏忽略此状态，三栏并排） */
  const [mobileTab, setMobileTab] = useState<MobileTab>('plan');
  const [prompt, setPrompt] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** 口径一致性：愿望与日期/天数矛盾时的提示卡（用户可一键修正或否决） */
  const [dateIssue, setDateIssue] = useState<DateIssue | null>(null);
  const [dateIssueDismissed, setDateIssueDismissed] = useState(false);
  /** 行程脚注（如周末口径的往返闭环说明），写进 Trip 随概况展示 */
  const [tripNote, setTripNote] = useState<string | null>(null);

  const [trip, setTrip] = useState<Trip>(base);
  const [summary, setSummary] = useState<PromptSummary>(() =>
    summarizePrompt('', cityId, monthOfISO(startDate), undefined)
  );

  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: EditorDraft } | null>(null);
  const [composer, setComposer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingScroll, setPendingScroll] = useState<'memory' | null>(null);

  const memoryRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  const budget = useMemo(() => budgetSummary(trip), [trip]);
  const fiveR = useMemo(() => fiveRProgress(trip, memories), [trip, memories]);

  // 手工录入的实价：按行 id（方向|区间|日期|方式）留存；日期或方式变了 id 就变了，
  // 那一行自然回到「估算 / 待确认」，不会拿旧价格冒充新行程的实价。
  const [manualFares, setManualFares] = useState<Record<string, ManualFare>>(() => {
    try {
      const raw = localStorage.getItem('lrw-manual-fares');
      const parsed = raw ? (JSON.parse(raw) as Record<string, ManualFare>) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const saveManualFare = useCallback((id: string, fare: ManualFare) => {
    setManualFares((prev) => {
      const next = { ...prev, [id]: fare };
      try {
        localStorage.setItem('lrw-manual-fares', JSON.stringify(next));
      } catch {
        /* 存不进去就只在本次会话内生效 */
      }
      return next;
    });
  }, []);
  const removeManualFare = useCallback((id: string) => {
    setManualFares((prev) => {
      const next = { ...prev };
      delete next[id];
      try {
        localStorage.setItem('lrw-manual-fares', JSON.stringify(next));
      } catch {
        /* 同上 */
      }
      return next;
    });
  }, []);

  // 旅行闭环时间账本：去程 / 返程 / 城际 + 逐日可玩时间 + 可行性。
  // 行程块增删后必须重算（例如删掉一个块，当天就不再超窗口）。
  const lifecycle = useMemo(
    () => (trip.journey ? buildLifecycle(trip.journey, trip.items) : null),
    [trip]
  );

  // 票价账本：把闭环引擎算出的去程 / 返程翻译成可核对的票价行（估算 / 实价 / 待确认）。
  // 依赖 lifecycle 而不是单独再查一次交通 —— 同一份方案，不重复计算。
  const fareLedger = useMemo(
    () =>
      buildFareLedger({
        legs: lifecycle?.legs ?? [],
        travelers: trip.travelers,
        manual: manualFares,
      }),
    [lifecycle, trip.travelers, manualFares]
  );

  // 大交通：按出发地到目的地的距离与出发日期（当季）推荐方式与价格区间
  const intercity = useMemo(
    () =>
      planIntercity(
        trip.origin || origin,
        {
          name: city.name,
          lat: city.lat,
          lng: city.lng,
          hasAirport: CITY_RATES[cityId].hasAirport,
          hasDirectRail: CITY_RATES[cityId].hasDirectRail,
          transferNote: CITY_RATES[cityId].transferNote,
        },
        trip.startDate
      ),
    [trip.origin, trip.startDate, origin, city, cityId]
  );

  // 吃住行全包预算（档位来自用户输入：穷游 / 轻奢 / 默认舒适）
  // 未识别出发地时不硬塞大交通，避免把"没填出发地"算成一笔臆测的机票钱
  const allIn = useMemo(() => {
    // 预算的大交通两行来自票价账本（含用户录入的实价）；没有账本行时退回原估算
    const ledgerBased =
      fareLedger.lines.length > 0
        ? {
            recognized: true,
            roundTripLow: fareLedger.perPerson.low,
            roundTripHigh: fareLedger.perPerson.high,
          }
        : intercity.recognized && intercity.km >= 40
          ? intercity
          : null;
    return fullBudget(
      trip,
      CITY_RATES[cityId],
      ledgerBased,
      parseTierFromInput(`${trip.preference} ${prompt}`)
    );
  }, [trip, cityId, intercity, fareLedger, prompt]);

  // 首页实时情绪预览：输入 + 城市联动（月份口径：出发日期优先，没填就按当前月）
  const landingMood = useMemo(
    () =>
      buildMood(
        city,
        `${prompt} ${chips.join(' ')}`,
        monthOfISO(startDate || parseDateFromInput(prompt)),
        ageNum
      ),
    [city, prompt, chips, startDate, ageNum]
  );

  // 首页实时提示：从输入里识别出的天数与出发日期
  const daysHint = useMemo(() => parseDaysFromInput(prompt), [prompt]);
  const dateHint = useMemo(() => parseDateFromInput(prompt), [prompt]);

  // 切换城市：重置为该城市的确定性骨架
  const handleSelectCity = useCallback((next: CityId) => {
    setCityId(next);
    const fresh = createTrip(next);
    setTrip(fresh);
    setSummary(summarizePrompt('', next, monthOfISO(startDate), ageNum));
    setSelectedDay(0);
    setSelectedItemId(null);
    setMemories([]);
    setError(null);
  }, []);

  /** 用输入里的天数 / 日期 / 关键词重排行程（输入几天就排几天）；age 供节奏个性化 */
  const replanTrip = useCallback(
    (s: PromptSummary, days: number | null, dateISO: string, tripAge?: number, note?: string | null) => {
      // 城市以解析结果为准：愿望文字里写的城市（如只填"腾冲"没点城市 chip）
      // 必须同步到 state，否则标题是腾冲、行程块/预算/住宿却还是旧城市（2026-10-10 实测）
      if (s.cityId !== cityId) setCityId(s.cityId);
      const fresh = createTrip(s.cityId, {
        days: days ?? undefined,
        startDate: dateISO || undefined,
        keywords: s.preference,
        age: tripAge,
        // 出发地必须一起传进生成器：闭环引擎（去程 / 返程 / 逐日可玩时间）靠它算，
        // 只写进 Trip.origin 而不进 journey，就会出现"概况显示杭州、闭环说未填出发地"
        origin,
      });
      setTrip({
        ...fresh,
        title: s.title,
        preference: s.preference,
        note: note ?? undefined,
        companions: s.companions,
        travelers: s.travelers,
        origin,
      });
    },
    [cityId, origin]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    []
  );

  // ── 模拟生成：确定性步骤序列，最后一个 tick 完成收尾 ──────────
  useEffect(() => {
    if (!generating) return;
    const stepMs = preferReducedMotion() ? 50 : 340;
    const t = window.setTimeout(() => {
      if (genStep >= 5) {
        setGenerating(false);
        setView('workbench');
        const first = dayItems(trip.items, 0)[0];
        setSelectedItemId(first ? first.id : null);
        return;
      }
      setGenStep((s) => s + 1);
    }, stepMs);
    return () => window.clearTimeout(t);
  }, [generating, genStep, trip.items]);

  useEffect(() => {
    if (view !== 'workbench' || pendingScroll !== 'memory') return;
    const id = window.setTimeout(() => {
      memoryRef.current?.scrollIntoView({
        behavior: preferReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
      setPendingScroll(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [view, pendingScroll]);

  // 手机端：把顶部标题条的实际高度写进 --wb-bar-h，
  // 让吸顶的日期标签正好贴在它下面，不重叠也不错位。
  useEffect(() => {
    const el = barRef.current;
    if (view !== 'workbench' || !el) {
      document.documentElement.style.removeProperty('--wb-bar-h');
      return;
    }
    const apply = () => {
      document.documentElement.style.setProperty(
        '--wb-bar-h',
        `${Math.round(el.getBoundingClientRect().height)}px`
      );
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--wb-bar-h');
    };
  }, [view]);

  /** 切换手机端分栏：换栏后直接定位到该栏顶部（跳过主题条，停在标题条之下） */
  const goMobileTab = useCallback((tab: MobileTab) => {
    setMobileTab(tab);
    requestAnimationFrame(() => {
      const grid = document.querySelector('.workbench-grid');
      const target = document.querySelector(`[data-mtab="${tab}"]`);
      if (!(grid instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        window.scrollTo({ top: 0, behavior: preferReducedMotion() ? 'auto' : 'smooth' });
        return;
      }
      const barVar = getComputedStyle(document.documentElement).getPropertyValue('--wb-bar-h');
      const barH = parseFloat(barVar) || 0;
      const top = grid.getBoundingClientRect().top + window.scrollY - barH - 2;
      window.scrollTo({ top, behavior: preferReducedMotion() ? 'auto' : 'smooth' });
    });
  }, []);

  const handleGenerate = useCallback(() => {
    const text = prompt.trim() || chips.join(' ');
    if (text.length === 0) {
      setError('先写下一句旅行愿望，或至少选一个快捷偏好，才能生成。');
      return;
    }
    setError(null);
    // 口径一致性检查：愿望里的时间词与所选日期/天数矛盾时，先提示、不静默改
    // （2026-10-10 用户反馈：写了"周末去"却排出周四，应该提示并给一键修正）
    if (!dateIssueDismissed) {
      const issues = checkDateConsistency({
        text,
        startDate,
        days: parseDaysFromInput(text),
      });
      if (issues.length > 0) {
        setDateIssue(issues[0]);
        return;
      }
    }
    setDateIssue(null);
    setGenStep(0);
    setGenerating(true);
  }, [prompt, chips, startDate, dateIssueDismissed]);

  /** 一键按建议口径修正（改日期/天数 + 行程脚注），然后正常生成 */
  const applyDateFix = useCallback(() => {
    if (!dateIssue) return;
    setStartDate(dateIssue.fix.startDate);
    setTripNote(dateIssue.fix.note);
    setDateIssue(null);
    setDateIssueDismissed(true);
    setGenStep(0);
    setGenerating(true);
  }, [dateIssue]);

  /** 保持当前口径继续生成（用户否决了建议） */
  const ignoreDateFix = useCallback(() => {
    setDateIssue(null);
    setDateIssueDismissed(true);
    setTripNote(null);
    setGenStep(0);
    setGenerating(true);
  }, []);

  const finalizeGenerate = useCallback(
    (text: string) => {
      // 穿搭 / 气温口径跟着出发月份走：显式日期优先，其次识别文字里的日期
      const s = summarizePrompt(text, cityId, monthOfISO(startDate || parseDateFromInput(text)), ageNum);
      setSummary(s);
      // 天数：输入写了几天就排几天；出发日期：优先取显式日期字段，其次识别文字里的日期
      const days = s.days;
      replanTrip(s, days, startDate || s.startDate || '', ageNum, tripNote);
      setSelectedDay(0);
      showToast(
        days !== null && days > MAX_TRIP_DAYS
          ? `本城精选路线为 ${MAX_TRIP_DAYS} 天，已按 ${MAX_TRIP_DAYS} 天排布，可逐块增删。`
          : `已按 ${s.days ?? trip.days.length} 天生成行程草稿：可以切换日期、编辑或添加体验块。`
      );
    },
    [cityId, startDate, replanTrip, showToast, ageNum, tripNote]
  );

  // 步骤走完的那一刻，把旅行愿望里的偏好写入状态
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!generating || genStep < 5) {
      appliedRef.current = false;
      return;
    }
    if (appliedRef.current) return;
    appliedRef.current = true;
    finalizeGenerate(prompt.trim() || chips.join(' '));
  }, [generating, genStep, prompt, chips, finalizeGenerate]);

  const toggleChip = (key: string) => {
    setChips((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
    setError(null);
  };

  const handleSelectItem = (id: string) => {
    setSelectedItemId(id);
    const item = trip.items.find((i) => i.id === id);
    if (item && item.dayIndex !== selectedDay) setSelectedDay(item.dayIndex);
  };

  const handleSaveItem = (item: ItineraryItem) => {
    setTrip((prev) => {
      const exists = prev.items.some((i) => i.id === item.id);
      return {
        ...prev,
        items: exists
          ? prev.items.map((i) => (i.id === item.id ? item : i))
          : [...prev.items, item],
      };
    });
    setSelectedDay(item.dayIndex);
    setSelectedItemId(item.id);
    setEditor(null);
    showToast(
      editor?.mode === 'add'
        ? '已加入行程块：当日预算与漫游里程已重算。'
        : '修改已保存：日程、预算与地图已同步更新。'
    );
  };

  const handleDeleteItem = (id: string) => {
    const item = trip.items.find((i) => i.id === id);
    setTrip((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== id) }));
    if (selectedItemId === id) setSelectedItemId(null);
    showToast(
      item
        ? `已删除「${placeView(item.placeId)?.name ?? item.placeId}」：总预算已重算为删除后的金额。`
        : '已删除该行程块。'
    );
  };

  const openAdd = (dayIndex: number) =>
    setEditor({ mode: 'add', draft: emptyDraft(cityId, dayIndex) });
  const openEdit = (item: ItineraryItem) =>
    setEditor({ mode: 'edit', draft: draftFromItem(item) });

  const openMemory = () => setComposer(true);

  const scrollToMemory = () => {
    setPendingScroll('memory');
    setView('workbench');
  };

  /** 游戏化入口完成 → 组装愿望、过一致性检查，然后走同一套生成引擎 */
  const startFromJourney = useCallback(
    (draft: JourneyDraft) => {
      const text = composeWish(draft);
      setPrompt(text);
      setChips(draft.styles);
      setOrigin(draft.origin);
      setStartDate(draft.startDate || '');
      if (draft.cityId) setCityId(draft.cityId);
      setError(null);
      const issues = checkDateConsistency({
        text,
        startDate: draft.startDate || '',
        days: parseDaysFromInput(text),
      });
      if (issues.length > 0) {
        setDateIssue(issues[0]);
        setDateIssueDismissed(false);
        return;
      }
      setDateIssue(null);
      setGenStep(0);
      setGenerating(true);
    },
    []
  );

  return (
    <div className="page">
      {view === 'worldmap' ? (
        <WorldMap
          cities={CITIES}
          memoryCount={memories.length}
          onGoMemory={scrollToMemory}
          onOpenForm={() => {
            setView('landing');
            setDateIssue(null);
          }}
          onStart={startFromJourney}
          dateIssue={dateIssue}
          onApplyDateFix={applyDateFix}
          onIgnoreDateFix={ignoreDateFix}
        />
      ) : view === 'landing' ? (
        <Landing
          value={prompt}
          onChange={(v) => {
            setPrompt(v);
            if (error) setError(null);
            // 愿望改了，口径矛盾提示要重新评估（否则修一次永远失效）
            setDateIssue(null);
            setDateIssueDismissed(false);
          }}
          chips={chips}
          onToggleChip={toggleChip}
          onGenerate={handleGenerate}
          onUseExample={() => {
            setPrompt(EXAMPLE_PROMPT);
            setError(null);
          }}
          generating={generating}
          genStep={genStep}
          error={error}
          onGoMemory={scrollToMemory}
          memoryCount={memories.length}
          city={city}
          cities={CITIES}
          onSelectCity={handleSelectCity}
          mood={landingMood}
          origin={origin}
          onOriginChange={setOrigin}
          startDate={startDate}
          onStartDateChange={(v) => {
            setStartDate(v);
            setDateIssue(null);
            setDateIssueDismissed(false);
          }}
          dateIssue={dateIssue}
          onApplyDateFix={applyDateFix}
          onIgnoreDateFix={ignoreDateFix}
          age={age}
          onAgeChange={setAge}
          daysHint={daysHint}
          dateHint={dateHint}
        />
      ) : (
        <>
          <div className="workbench-bar" ref={barRef}>
            <div className="inner">
              <AppHeader
                inWorkbench
                onGoWorkbench={() => {
                  setView('workbench');
                  window.scrollTo({ top: 0, behavior: preferReducedMotion() ? 'auto' : 'smooth' });
                }}
                onGoLanding={() => {
                  // 「改写愿望」回世界地图入口：草稿本地留存，可继续上次旅程
                  setView('worldmap');
                  setGenerating(false);
                  setError(null);
                }}
                onGoMemory={scrollToMemory}
                memoryCount={memories.length}
              />
              <div className="titles">
                <div style={{ minWidth: 0 }}>
                  <p className="eyebrow">行程工作台 · Workbench</p>
                  <h1 className="trip-title">{summary.title}</h1>
                  <p className="trip-meta">
                    <span>
                      {trip.origin ? `${trip.origin} → ` : ''}
                      {trip.destination} · {trip.days[0]?.date} – {trip.days[trip.days.length - 1]?.date} · {trip.days.length} 天
                    </span>
                    {lifecycle ? (
                      <span data-testid="bar-play">
                        实际可玩 <b>{humanDuration(lifecycle.playMinutes)}</b>
                        {lifecycle.mode === 'round-trip' ? ` · 往返交通 ${humanDuration(lifecycle.travelMinutes)}` : ''}
                      </span>
                    ) : null}
                    <span>同行：{trip.companions}（{trip.travelers} 人）</span>
                    <span>行程块 {trip.items.length} 个</span>
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
                  <span className="mini-chips" style={{ marginTop: 0, gap: 22 }}>
                    <span className="mc" data-testid="bar-budget">
                      <b>
                        {formatCNY(allIn.low)}
                        {allIn.high > allIn.low ? ` – ${formatCNY(allIn.high)}` : ''}
                      </b>
                      吃住行预算
                    </span>
                    <span className="mc" data-testid="bar-roam">
                      <b>{formatKm(trip.items.reduce((s, i) => s + (i.roamKm ?? 0), 0))}</b>
                      {trip.destination}城市漫游
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <TravelMood city={city} mood={summary.mood} month={monthOfISO(trip.startDate)} />

          <div className="workbench-grid">
            <aside
              className={`wb-col left${mobileTab === 'overview' ? ' is-mtab-active' : ''}`}
              data-mtab="overview"
              aria-label="旅程概况"
            >
              <div className="col-head">
                <p className="eyebrow">I · 旅程概况</p>
                <span className="idx">OVERVIEW</span>
              </div>
              <TripSummary
                trip={trip}
                summary={summary}
                budget={budget}
                allIn={allIn}
                intercity={intercity}
                cityRates={CITY_RATES[cityId]}
                selectedDay={selectedDay}
                onSelectDay={(d) => {
                  setSelectedDay(d);
                  setMobileTab('plan');
                }}
              />
              {lifecycle ? <JourneyClosure lifecycle={lifecycle} variant="summary" /> : null}
            </aside>
            {posterOpen ? (
              <TripPoster trip={trip} city={city} onClose={() => setPosterOpen(false)} />
            ) : null}

            <main
              className={`wb-col center${mobileTab === 'plan' ? ' is-mtab-active' : ''}`}
              data-mtab="plan"
              aria-label="逐日行程"
            >
              <div className="col-head">
                <p className="eyebrow">II · 逐日行程</p>
                <span className="idx">ITINERARY</span>
              </div>
              <ItineraryBoard
                trip={trip}
                cityId={city.id}
                legs={lifecycle?.legs}
                playMinutes={lifecycle?.days[selectedDay]?.playMinutes}
                selectedDay={selectedDay}
                selectedItemId={selectedItemId}
                onSelectDay={setSelectedDay}
                onSelectItem={handleSelectItem}
                onEditItem={openEdit}
                onDeleteItem={handleDeleteItem}
                onAddItem={openAdd}
              />
            </main>

            <aside
              className={`wb-col right${mobileTab === 'map' ? ' is-mtab-active' : ''}`}
              data-mtab="map"
              aria-label="路线与地点"
            >
              <div className="col-head">
                <p className="eyebrow">III · 路线与地点</p>
                <button
                  type="button"
                  className="poster-open-btn"
                  onClick={() => setPosterOpen(true)}
                  title="生成可分享的行程规划图（左行程 · 右地图 · 照片带）"
                >
                  ✦ 生成行程图
                </button>
              </div>
              <TripMap
                trip={trip}
                selectedDay={selectedDay}
                selectedItemId={selectedItemId}
                onSelectItem={handleSelectItem}
                focusLabel={city.name}
              />
              <div style={{ marginTop: 26 }}>
                <PlaceList
                  trip={trip}
                  selectedDay={selectedDay}
                  selectedItemId={selectedItemId}
                  onSelectItem={handleSelectItem}
                />
              </div>
            </aside>

            <div
              className={`wb-band-slot${mobileTab === 'overview' ? ' is-mtab-active' : ''}`}
              data-mtab="overview"
            >
              <RhythmBand
                trip={trip}
                fiveR={fiveR}
                selectedDay={selectedDay}
                onSelectDay={(d) => {
                  setSelectedDay(d);
                  setMobileTab('plan');
                }}
                memories={memories}
                onOpenMemory={openMemory}
              />
            </div>

            {/* 大交通票价账本：来源 / 查询时间 / 官方核对入口 / 手工录入实价 */}
            <div
              className={`wb-fare-slot${mobileTab === 'overview' ? ' is-mtab-active' : ''}`}
              data-mtab="overview"
            >
              <FareLedgerPanel
                ledger={fareLedger}
                onSave={saveManualFare}
                onRemove={removeManualFare}
              />
            </div>

            {/* 旅行时间账本：明细放全宽带横排（左栏塞不下，会撑出大片空白） */}
            <div
              className={`wb-closure-slot${mobileTab === 'overview' ? ' is-mtab-active' : ''}`}
              data-mtab="overview"
            >
              {lifecycle ? <JourneyClosure lifecycle={lifecycle} variant="detail" /> : null}
            </div>

            <div
              className={`wb-stay-slot${mobileTab === 'stay' ? ' is-mtab-active' : ''}`}
              data-mtab="stay"
            >
              <StaySection cityId={cityId} trip={trip} />
            </div>

            <div
              className={`wb-memory-slot${mobileTab === 'memory' ? ' is-mtab-active' : ''}`}
              data-mtab="memory"
            >
              <MemorySection
                memories={memories}
                onCompose={openMemory}
                onDelete={(id) => {
                  setMemories((prev) => prev.filter((m) => m.id !== id));
                  showToast('记忆已删除。');
                }}
                anchorRef={memoryRef}
              />
            </div>
          </div>

          <MobileTabBar
            active={mobileTab}
            onChange={goMobileTab}
            memoryCount={memories.length}
          />

          {mobileTab === 'plan' ? (
            <button
              type="button"
              className="mobile-fab"
              onClick={() => openAdd(selectedDay)}
              aria-label={`在第 ${selectedDay + 1} 天加一个体验块`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5.5v13M5.5 12h13" />
              </svg>
            </button>
          ) : null}
        </>
      )}

      {editor ? (
        <ItemEditor
          mode={editor.mode}
          draft={editor.draft}
          dayLabel={`第 ${editor.draft.dayIndex + 1} 天 · ${trip.days[editor.draft.dayIndex]?.date ?? ''}`}
          cityId={cityId}
          onCancel={() => setEditor(null)}
          onSave={handleSaveItem}
        />
      ) : null}

      {composer ? (
        <MemoryComposer
          trip={trip}
          defaultDayIndex={selectedDay}
          defaultItemId={selectedItemId}
          onCancel={() => setComposer(false)}
          onSave={(m) => {
            setMemories((prev) => [m, ...prev]);
            setComposer(false);
            setPendingScroll('memory');
            showToast('已沉淀一张 World Memory：Remember 进度已更新。');
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
