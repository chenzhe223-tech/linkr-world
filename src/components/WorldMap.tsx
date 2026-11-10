// Link-R World — 游戏化中国地图首页
//
// 产品核心理念：R = Roam · Route · Relate · Real · Remember
// Explore → Find Route → Resonance → Real → Memory → Roam Again
// 游戏是入口，旅行规划是核心价值：用「跳一跳」式的轻量探索采集旅行需求，
// 逐步替掉传统长问卷，降低用户表达旅行愿望的心理负担。
//
// 流程：
//   入口  中国地图 + 一个明确的起点路标（宁波）+ Start Exploring / Surprise Me / Resume
//   跳跃  每答完一站，小旅行家跳到下一个路标（纯 CSS 过渡，不做物理引擎）
//   问句  落地后给一个小问题：出发时间 → 出发地 → 目的地 → 天数 → 风格 → 个性化
//   丰富  走到过的路标连成虚线，选中的目的地作为金色终点亮起；可回跳改答案（不丢已填）
//   收口  画像卡确认，交给既有行程引擎生成（可随时跳过游戏直接填表单）
//
// 为什么用中国地图而不是世界地图：国内版的行程全部发生在国内，世界地图上中国只是一小块，
// 点全挤在一起既看不出方位也点不中；换成自研中国经纬线地图后，路标按真实经纬度落位，
// 相对方位与距离一眼可读，地图与行程卡片共用同一份坐标数据，不会各说一套。

import { useEffect, useMemo, useState } from "react";
import type { CityInfo, CityId } from "../data/cities";
import type { DateIssue } from "../lib/consistency";
import { AppHeader } from "../brand/AppHeader";
import { ChinaMap, type MapPinState, type MapPlace } from "./ChinaMap";

/* ── 旅程草稿（本地留存，支持 Resume Journey） ─────────────── */

export interface JourneyDraft {
  /** time: 'soon' | 'date' | 'undecided' */
  timeMode: "soon" | "date" | "undecided";
  startDate: string;
  origin: string;
  /** dest: 'picked' | 'later'（稍后按风格推荐） */
  destMode: "picked" | "later";
  cityId: CityId | null;
  days: number | null;
  styles: string[];
  companions: string;
  pace: string;
  budget: string;
  freeText: string;
  /** 自驾追问：每天驾驶时长 */
  driveHours: string;
  /** 走到的步骤（Resume 用） */
  step: number;
}

const DRAFT_KEY = "lrw-journey-draft";

const EMPTY_DRAFT: JourneyDraft = {
  timeMode: "soon",
  startDate: "",
  origin: "",
  destMode: "picked",
  cityId: null,
  days: null,
  styles: [],
  companions: "",
  pace: "",
  budget: "",
  freeText: "",
  driveHours: "",
  step: 0,
};

function loadDraft(): JourneyDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as JourneyDraft;
    if (!d || typeof d !== "object") return null;
    return { ...EMPTY_DRAFT, ...d };
  } catch {
    return null;
  }
}

function saveDraft(d: JourneyDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* 存不进就不存 */
  }
}

/** 下一个周六（周末口径默认出发日） */
function nextSaturday(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

/* ── 问题站定义 ───────────────────────────────────────────── */

type StepKey =
  "time" | "origin" | "dest" | "days" | "style" | "extras" | "profile";

const STEPS: Array<{ key: StepKey; label: string; en: string }> = [
  { key: "time", label: "出发时间", en: "When" },
  { key: "origin", label: "出发地", en: "From" },
  { key: "dest", label: "目的地", en: "Where" },
  { key: "days", label: "旅行天数", en: "How long" },
  { key: "style", label: "旅行风格", en: "Style" },
  { key: "extras", label: "个性化", en: "You" },
  { key: "profile", label: "确认出发", en: "Profile" },
];

/**
 * 七个探索路标：把「跳一跳」的落点安在中国的真实经纬度上。
 * 选点两条规矩：① 彼此拉开（不重叠、点得中）；② 刻意避开目的地城市库，
 * 免得用户选中同一座城时终点标记和路标压在一起。
 */
interface Station {
  key: StepKey;
  city: string;
  lat: number;
  lng: number;
  /** 到站时的一句引导，说明为什么在这一站问这个 */
  note: string;
}

export const STATIONS: Station[] = [
  {
    key: "time",
    city: "宁波",
    lat: 29.87,
    lng: 121.55,
    note: "从东海边出发。第一件事：定下出发的日子。",
  },
  {
    key: "origin",
    city: "广州",
    lat: 23.13,
    lng: 113.26,
    note: "从哪儿出发？这决定大交通怎么算、要留多少路上时间。",
  },
  {
    key: "dest",
    city: "重庆",
    lat: 29.56,
    lng: 106.55,
    note: "想去哪儿？心里没数也行，下一站按感觉挑。",
  },
  {
    key: "days",
    city: "昆明",
    lat: 25.04,
    lng: 102.71,
    note: "玩几天？这里决定行程密度 —— 天数不够时会劝你减景点而不是硬塞。",
  },
  {
    key: "style",
    city: "拉萨",
    lat: 29.65,
    lng: 91.14,
    note: "这趟最想要什么感觉？最多选 4 个。",
  },
  {
    key: "extras",
    city: "乌鲁木齐",
    lat: 43.83,
    lng: 87.62,
    note: "和谁去、什么节奏、大概花多少。",
  },
  {
    key: "profile",
    city: "哈尔滨",
    lat: 45.8,
    lng: 126.53,
    note: "看一眼画像，确认就生成行程。",
  },
];

/** 风格 chips：文案与行程引擎的兴趣词对齐（书店/咖啡/夜市/茶/古城/海边/山/博物馆/市集） */
const STYLE_CHIPS = [
  "自然风光",
  "海边",
  "山野徒步",
  "古城小镇",
  "城市漫步",
  "文化展览",
  "美食市集",
  "咖啡书店",
  "摄影出片",
  "夜市烟火",
  "自驾",
  "休闲不赶路",
];

const COMPANION_CHIPS = ["一个人", "情侣", "和朋友", "带父母和孩子"];
const PACE_CHIPS = ["不赶路", "正常节奏", "紧凑打卡"];
const BUDGET_CHIPS = ["经济档", "舒适档", "轻奢档"];
const DRIVE_CHIPS = ["每天 ≤2 小时", "每天 3–4 小时", "不开长途"];

/** 按风格推荐目的地（确定性：风格 → 城市主题词匹配，给出 3 座） */
function recommendCities(cities: CityInfo[], styles: string[]): CityInfo[] {
  const keys: Record<string, string[]> = {
    自然风光: ["苍山", "火山", "雪水", "洱海", "茶山"],
    海边: ["海", "湾"],
    山野徒步: ["山", "徒步", "茶山"],
    古城小镇: ["古城", "白族", "纳西", "骑楼"],
    城市漫步: ["弄堂", "街巷", "书"],
    文化展览: ["博物", "展览", "碑"],
    美食市集: ["食", "市集", "小吃"],
    咖啡书店: ["咖啡", "书"],
    摄影出片: ["摄影", "日出", "光影"],
    夜市烟火: ["夜市", "烟火"],
    自驾: ["环湖", "公路"],
    休闲不赶路: ["温泉", "慢", "泡"],
  };
  const want = styles.flatMap((s) => keys[s] ?? [s]);
  const scored = cities.map((c) => {
    const hay = `${c.name}${c.character.join("")}${c.slogan.title}${c.slogan.sub}`;
    const hit = want.filter((k) => hay.includes(k)).length;
    return { c, hit };
  });
  return scored
    .sort(
      (a, b) => b.hit - a.hit || a.c.name.localeCompare(b.c.name, "zh-Hans-CN"),
    )
    .slice(0, 3)
    .map((x) => x.c);
}

/** 草稿 → 一句旅行愿望（走既有行程引擎的解析口径） */
export function composeWish(d: JourneyDraft): string {
  const city = d.cityId;
  const parts: string[] = [];
  if (d.timeMode === "undecided") parts.push("日期未定，");
  if (d.days) parts.push(`${d.days} 天`);
  const styleText = d.styles.length > 0 ? d.styles.join("、") : "";
  const extra = [
    d.pace,
    d.budget === "经济档" ? "穷游" : d.budget === "轻奢档" ? "轻奢" : "",
    d.freeText,
    d.driveHours,
  ]
    .filter(Boolean)
    .join("，");
  const head = d.companions ? `${d.companions}去` : "去";
  return `${head}${city ?? "一座慢城"} ${parts.join(" ")}，想${styleText || "随便走走"}${extra ? "，" + extra : ""}。`
    .replace(/\s+/g, " ")
    .trim();
}

/* ── 组件 ────────────────────────────────────────────────── */

interface WorldMapProps {
  cities: CityInfo[];
  memoryCount: number;
  onGoMemory: () => void;
  /** 跳过游戏，直接用传统表单填写 */
  onOpenForm: () => void;
  /** 画像卡确认 → 生成行程（App 负责一致性检查与生成） */
  onStart: (draft: JourneyDraft) => void;
  /** 口径矛盾提示（App 检查后回传，与表单同一套交互） */
  dateIssue?: DateIssue | null;
  onApplyDateFix?: () => void;
  onIgnoreDateFix?: () => void;
}

export function WorldMap({
  cities,
  memoryCount,
  onGoMemory,
  onOpenForm,
  onStart,
  dateIssue,
  onApplyDateFix,
  onIgnoreDateFix,
}: WorldMapProps) {
  const [started, setStarted] = useState(false);
  const [draft, setDraft] = useState<JourneyDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState(0); // 0..6 = STEPS 下标
  const [showResume, setShowResume] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<JourneyDraft | null>(null);

  // Step 1：检查有没有未完成的旅程
  useEffect(() => {
    const d = loadDraft();
    if (d && (d.step > 0 || d.cityId || d.origin || d.styles.length > 0)) {
      setResumeDraft(d);
      setShowResume(true);
    }
  }, []);

  // Step 2/3：每一步落盘（避免误操作丢失已填信息）
  useEffect(() => {
    if (!started) return;
    saveDraft({ ...draft, step });
  }, [draft, step, started]);

  const cityById = useMemo(
    () => new Map(cities.map((c) => [c.id, c])),
    [cities],
  );

  const jumpTo = (i: number) => {
    if (i <= step) setStep(i);
  };

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const surprise = () => {
    // 确定性的"惊喜"：按今天日期从城市表轮换，不出随机数（可复现，测试友好）
    const dayNum = Math.floor(Date.now() / 86_400_000);
    const c = cities[dayNum % cities.length];
    const d: JourneyDraft = {
      ...EMPTY_DRAFT,
      cityId: c.id,
      destMode: "picked",
      timeMode: "soon",
      startDate: nextSaturday(),
    };
    setDraft(d);
    setStarted(true);
    setStep(STEPS.findIndex((s) => s.key === "profile"));
  };

  const startFresh = () => {
    setDraft({ ...EMPTY_DRAFT, startDate: nextSaturday() });
    setStarted(true);
    setStep(0);
  };

  const resume = () => {
    if (resumeDraft) {
      setDraft(resumeDraft);
      setStarted(true);
      setStep(Math.min(resumeDraft.step, STEPS.length - 1));
    }
    setShowResume(false);
  };

  const set = (patch: Partial<JourneyDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const toggleStyle = (s: string) =>
    setDraft((d) => ({
      ...d,
      styles: d.styles.includes(s)
        ? d.styles.filter((x) => x !== s)
        : [...d.styles, s].slice(0, 4),
    }));

  const city = draft.cityId ? cityById.get(draft.cityId) : null;
  const recs = useMemo(
    () =>
      draft.destMode === "later" &&
      step >= STEPS.findIndex((s) => s.key === "style")
        ? recommendCities(cities, draft.styles)
        : [],
    [draft.destMode, draft.styles, cities, step],
  );

  // 未完成的必填项：目的地
  const canGenerate = draft.destMode === "picked" && draft.cityId !== null;

  if (!started) {
    return (
      <div className="worldmap" data-testid="worldmap">
        <AppHeader
          inWorkbench={false}
          onGoWorkbench={() => undefined}
          onGoLanding={() => undefined}
          onGoMemory={onGoMemory}
          memoryCount={memoryCount}
        />
        <div className="wm-stage">
          <div className="wm-hero">
            <p className="eyebrow on-blue">LINK-R WORLD · 游戏化旅行规划</p>
            <h1>
              在中国的版图上，
              <br />
              跳着跳着就把旅行<em>想清楚了</em>。
            </h1>
            <p className="wm-lede">
              不用先填一张问卷。从东海的起点出发，每跳到一个路标回答一个小问题，
              落地即成一份走得下去的行程 —— Roam · Route · Relate · Real ·
              Remember。
            </p>
            <div className="wm-cta">
              <button
                type="button"
                className="btn-primary wm-cta-main"
                data-testid="wm-start"
                onClick={startFresh}
              >
                Start Exploring · 开始探索
              </button>
              <button
                type="button"
                className="btn-ghost"
                data-testid="wm-surprise"
                onClick={surprise}
              >
                Surprise Me · 给我惊喜
              </button>
              {showResume && resumeDraft ? (
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="wm-resume"
                  onClick={resume}
                >
                  Resume Journey · 继续上次（第{" "}
                  {Math.min(resumeDraft.step + 1, STEPS.length)} 站）
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-link wm-skip-form"
              data-testid="wm-skip-form"
              onClick={onOpenForm}
            >
              不想玩，直接填写表单 →
            </button>
          </div>
          <div className="wm-maphost" data-testid="wm-map">
            <ExploreMap />
            <p className="wm-map-hint" data-testid="wm-map-hint">
              地图上七个金色路标就是七个小问题：从<strong>宁波</strong>
              出发，一路跳到哈尔滨，
              行程需求就自己长出来了。也可以随时跳过，直接填表单。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cur = STEPS[step];

  return (
    <div className="worldmap" data-testid="worldmap">
      <AppHeader
        inWorkbench={false}
        onGoWorkbench={() => undefined}
        onGoLanding={onOpenForm}
        onGoMemory={onGoMemory}
        memoryCount={memoryCount}
      />
      <div className="wm-stage wm-playing">
        <div className="wm-play-main">
          <div className="wm-hud">
            <div
              className="wm-progress"
              aria-label={`第 ${step + 1} 站，共 ${STEPS.length} 站`}
            >
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className={`wm-pip${i < step ? " done" : i === step ? " now" : ""}`}
                >
                  {i < step ? (draftSkipped(s.key, draft) ? "?" : "✓") : i + 1}
                </span>
              ))}
            </div>
            <p className="wm-progress-label">
              第 {step + 1} 站 ·{" "}
              {STATIONS[Math.min(step, STATIONS.length - 1)].city} / 共{" "}
              {STEPS.length} 站 · {cur.label}
            </p>
            <p className="wm-station-note" data-testid="wm-station-note">
              {STATIONS[Math.min(step, STATIONS.length - 1)].note}
            </p>
          </div>

          <div className="wm-card" data-testid="wm-card" key={cur.key}>
            {cur.key === "time" ? (
              <TimeStep
                draft={draft}
                set={set}
                onNext={next}
                onSkip={next}
                onBack={back}
              />
            ) : cur.key === "origin" ? (
              <OriginStep
                draft={draft}
                set={set}
                onNext={next}
                onSkip={next}
                onBack={back}
              />
            ) : cur.key === "dest" ? (
              <DestStep
                draft={draft}
                set={set}
                cities={cities}
                onNext={next}
                onSkip={next}
                onBack={back}
              />
            ) : cur.key === "days" ? (
              <DaysStep
                draft={draft}
                set={set}
                onNext={next}
                onSkip={next}
                onBack={back}
              />
            ) : cur.key === "style" ? (
              <div>
                <StepHead
                  title="这趟旅行，你最想要什么感觉？"
                  hint="最多选 4 个；选「自驾」会多问你一句开车的事。"
                />
                <div className="wm-chips">
                  {STYLE_CHIPS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`wm-chip${draft.styles.includes(s) ? " on" : ""}`}
                      aria-pressed={draft.styles.includes(s)}
                      onClick={() => toggleStyle(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <StepNav
                  onNext={next}
                  onBack={back}
                  nextLabel="下一站"
                  canNext={draft.styles.length > 0}
                />
              </div>
            ) : cur.key === "extras" ? (
              <ExtrasStep draft={draft} set={set} onNext={next} onBack={back} />
            ) : (
              <ProfileStep
                draft={draft}
                city={city ?? null}
                recs={recs}
                setDraft={setDraft}
                onJump={(i) => setStep(i)}
                canGenerate={canGenerate}
                onStart={() => canGenerate && onStart(draft)}
                dateIssue={dateIssue}
                onApplyDateFix={onApplyDateFix}
                onIgnoreDateFix={onIgnoreDateFix}
              />
            )}
          </div>

          {/* 动态探索：目的地未定 → 风格选完后给推荐 */}
          {recs.length > 0 && draft.destMode === "later" && !draft.cityId ? (
            <div className="wm-recs" data-testid="wm-recs">
              <p className="wm-recs-title">按你的风格，先推荐三座城：</p>
              <div className="wm-chips">
                {recs.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="wm-chip"
                    onClick={() => set({ cityId: c.id, destMode: "picked" })}
                  >
                    {c.name} · {c.slogan.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* 游戏化不能拖慢规划：任何时候都能直接进常规表单 */}
          <button
            type="button"
            className="btn-link wm-skip-inline"
            data-testid="wm-skip-form-inline"
            onClick={onOpenForm}
          >
            不想继续玩，直接填写表单 →
          </button>
        </div>

        <div className="wm-maphost" data-testid="wm-map">
          <ExploreMap step={step} city={city} onJump={jumpTo} />
          <p className="wm-map-hint">
            虚线是已经走过的探索路径，金色是当前路标。点已到过的路标可以回头改答案，已填内容不会丢。
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── 各站问题卡 ──────────────────────────────────────────── */

function StepHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="wm-step-head">
      <h2>{title}</h2>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

function StepNav({
  onNext,
  onBack,
  onSkip,
  nextLabel = "落定，跳下一站",
  canNext = true,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  canNext?: boolean;
}) {
  return (
    <div className="wm-nav">
      <button type="button" className="btn-link" onClick={onBack}>
        ← 返回修改
      </button>
      {onSkip ? (
        <button type="button" className="btn-link" onClick={onSkip}>
          跳过 / 不确定
        </button>
      ) : null}
      <button
        type="button"
        className="btn-primary"
        onClick={onNext}
        disabled={!canNext}
      >
        {nextLabel}
      </button>
    </div>
  );
}

function TimeStep({ draft, set, onNext, onSkip, onBack }: StepCtx) {
  const options: Array<{
    key: JourneyDraft["timeMode"];
    label: string;
    hint: string;
  }> = [
    { key: "soon", label: "近期出发", hint: "帮你按最近的周末排" },
    { key: "date", label: "我有具体日期", hint: "选哪天就从哪天开始排" },
    {
      key: "undecided",
      label: "日期未定",
      hint: "先把行程画出来，日期以后再说",
    },
  ];
  return (
    <div>
      <StepHead
        title="什么时候出发？"
        hint="不确定就选「日期未定」，不会卡住你。"
      />
      <div className="wm-options">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`wm-option${draft.timeMode === o.key ? " on" : ""}`}
            onClick={() =>
              set({
                timeMode: o.key,
                startDate: o.key === "soon" ? nextSaturday() : draft.startDate,
              })
            }
          >
            <b>{o.label}</b>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
      {draft.timeMode === "date" ? (
        <input
          type="date"
          className="wm-date"
          data-testid="wm-date"
          value={draft.startDate}
          onChange={(e) => set({ startDate: e.target.value })}
        />
      ) : null}
      <StepNav
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
        nextLabel="下一站"
      />
    </div>
  );
}

function OriginStep({ draft, set, onNext, onSkip, onBack }: StepCtx) {
  return (
    <div>
      <StepHead
        title="从哪里出发？"
        hint="只用来算大交通和往返时间；不想填就跳过。"
      />
      <input
        className="wm-input"
        data-testid="wm-origin"
        value={draft.origin}
        onChange={(e) => set({ origin: e.target.value })}
        placeholder="例如：杭州（可跳过）"
      />
      <StepNav
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
        nextLabel="下一站"
      />
    </div>
  );
}

function DestStep({
  draft,
  set,
  cities,
  onNext,
  onBack,
}: StepCtx & { cities: CityInfo[] }) {
  return (
    <div>
      <StepHead
        title="想去哪儿？"
        hint="已经心里有数就直接点；还没想好就选「稍后按风格推荐」。"
      />
      <div className="wm-dest-modes">
        <button
          type="button"
          className={`wm-option${draft.destMode === "picked" ? " on" : ""}`}
          onClick={() => set({ destMode: "picked" })}
        >
          <b>已确定目的地</b>
          <span>下面点一座城</span>
        </button>
        <button
          type="button"
          className={`wm-option${draft.destMode === "later" ? " on" : ""}`}
          onClick={() => set({ destMode: "later", cityId: null })}
        >
          <b>还没想好</b>
          <span>风格选完后帮你推荐</span>
        </button>
      </div>
      {draft.destMode === "picked" ? (
        <div className="wm-chips">
          {cities.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`wm-chip${draft.cityId === c.id ? " on" : ""}`}
              aria-pressed={draft.cityId === c.id}
              onClick={() => set({ cityId: c.id })}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
      <StepNav
        onNext={onNext}
        onBack={onBack}
        canNext={draft.destMode === "later" || draft.cityId !== null}
        nextLabel="下一站"
      />
    </div>
  );
}

function DaysStep({ draft, set, onNext, onSkip, onBack }: StepCtx) {
  const ranges: Array<{ label: string; min: number; max: number }> = [
    { label: "1–2 天", min: 1, max: 2 },
    { label: "3–5 天", min: 3, max: 5 },
    { label: "6–9 天", min: 6, max: 9 },
    { label: "10 天以上", min: 10, max: 30 },
  ];
  // 已有天数时恢复所在区间（从画像卡「改」跳回来不丢展开态）
  const [range, setRange] = useState<number | null>(() => {
    const d = draft.days;
    if (d === null) return null;
    return ranges.find((r) => d >= r.min && d <= r.max)?.max ?? null;
  });
  const exact = draft.days;
  // 点区间就自动落一个默认天数：不强迫用户二次点击，
  // 否则「下一站」会一直禁用（2026-10-10 用户反馈"无法点击下一步"）
  const pickRange = (r: { min: number; max: number }) => {
    setRange(r.max);
    const d = draft.days;
    const inRange = d !== null && d >= r.min && d <= Math.min(r.max, 5);
    if (!inRange) set({ days: r.max > 5 ? 5 : r.min === 1 ? 2 : r.min });
  };
  const rangeDef =
    range !== null ? ranges.find((r) => r.max === range) : undefined;
  // 区间封顶 5 天：6–9 / 10+ 的具体 chips 会算出负长度（一个都不渲染，卡死该步）
  const exactChips =
    rangeDef && rangeDef.min <= 5
      ? Array.from(
          { length: Math.min(rangeDef.max, 5) - rangeDef.min + 1 },
          (_, k) => rangeDef.min + k,
        )
      : [];
  return (
    <div>
      <StepHead
        title="玩几天？"
        hint="走多远算多远：本城精选路线最多 5 天，更长的天数会按 5 天排并留白。"
      />
      <div className="wm-chips">
        {ranges.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`wm-chip${range === r.max ? " on" : ""}`}
            onClick={() => pickRange(r)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {range !== null && exactChips.length > 0 ? (
        <div>
          <p className="wm-field-label">
            具体几天？（已帮你选了个顺手的，可改）
          </p>
          <div className="wm-chips">
            {exactChips.map((n) => (
              <button
                key={n}
                type="button"
                className={`wm-chip${exact === n ? " on" : ""}`}
                onClick={() => set({ days: n })}
              >
                {n} 天
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {range !== null && rangeDef && rangeDef.min > 5 ? (
        <div className="wm-chips">
          <button
            type="button"
            className={`wm-chip${exact === 5 ? " on" : ""}`}
            onClick={() => set({ days: 5 })}
          >
            就按 5 天走
          </button>
          <span className="wm-range-note">
            本城精选按 5 天排，多出的天数留白自己逛。
          </span>
        </div>
      ) : null}
      <StepNav
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
        canNext={exact !== null}
        nextLabel="下一站"
      />
    </div>
  );
}

function ExtrasStep({ draft, set, onNext, onBack }: StepCtx) {
  const wantsDrive = draft.styles.includes("自驾");
  return (
    <div>
      <StepHead
        title="最后几件小事"
        hint="每一条都可以跳过 —— 留空的就按大众口径来。"
      />
      <p className="wm-field-label">和谁一起去</p>
      <div className="wm-chips">
        {COMPANION_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className={`wm-chip${draft.companions === c ? " on" : ""}`}
            onClick={() => set({ companions: draft.companions === c ? "" : c })}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="wm-field-label">节奏</p>
      <div className="wm-chips">
        {PACE_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className={`wm-chip${draft.pace === c ? " on" : ""}`}
            onClick={() => set({ pace: draft.pace === c ? "" : c })}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="wm-field-label">预算档</p>
      <div className="wm-chips">
        {BUDGET_CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className={`wm-chip${draft.budget === c ? " on" : ""}`}
            onClick={() => set({ budget: draft.budget === c ? "" : c })}
          >
            {c}
          </button>
        ))}
      </div>
      {wantsDrive ? (
        <>
          <p className="wm-field-label">自驾的话，每天开车多久能接受？</p>
          <div className="wm-chips" data-testid="wm-drive">
            {DRIVE_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={`wm-chip${draft.driveHours === c ? " on" : ""}`}
                onClick={() =>
                  set({ driveHours: draft.driveHours === c ? "" : c })
                }
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <p className="wm-field-label">还有什么想说的（自由发挥）</p>
      <textarea
        className="wm-input"
        rows={2}
        value={draft.freeText}
        onChange={(e) => set({ freeText: e.target.value })}
        placeholder="例如：想住有院子的民宿 / 不吃辣 / 想看日出"
      />
      <StepNav onNext={onNext} onBack={onBack} nextLabel="去确认行程画像" />
    </div>
  );
}

function ProfileStep({
  draft,
  city,
  recs,
  setDraft,
  onJump,
  canGenerate,
  onStart,
  dateIssue,
  onApplyDateFix,
  onIgnoreDateFix,
}: {
  draft: JourneyDraft;
  city: CityInfo | null;
  recs: CityInfo[];
  setDraft: (fn: (d: JourneyDraft) => JourneyDraft) => void;
  onJump: (step: number) => void;
  canGenerate: boolean;
  onStart: () => void;
  dateIssue?: DateIssue | null;
  onApplyDateFix?: () => void;
  onIgnoreDateFix?: () => void;
}) {
  const rows: Array<{ label: string; value: string; step: number }> = [
    {
      label: "出发时间",
      value:
        draft.timeMode === "undecided"
          ? "日期未定"
          : draft.startDate || "近期出发（最近的周末）",
      step: 0,
    },
    {
      label: "出发地",
      value: draft.origin || "未填（只影响大交通估算）",
      step: 1,
    },
    {
      label: "目的地",
      value: city
        ? `${city.name} · ${city.province}`
        : draft.destMode === "later"
          ? "待定（看下面推荐）"
          : "未选",
      step: 2,
    },
    {
      label: "旅行天数",
      value: draft.days ? `${draft.days} 天` : "未定",
      step: 3,
    },
    { label: "旅行风格", value: draft.styles.join(" · ") || "未选", step: 4 },
    {
      label: "个性化",
      value:
        [
          draft.companions,
          draft.pace,
          draft.budget,
          draft.driveHours,
          draft.freeText,
        ]
          .filter(Boolean)
          .join(" · ") || "按大众口径",
      step: 5,
    },
  ];
  return (
    <div data-testid="wm-profile">
      <StepHead
        title="你的旅行画像"
        hint="哪一行想改，点「改」跳回去，不用重新玩。"
      />
      <div className="wm-profile-rows">
        {rows.map((r) => (
          <div key={r.label} className="wm-profile-row">
            <span className="k">{r.label}</span>
            <span className="v">{r.value}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => onJump(r.step)}
            >
              改
            </button>
          </div>
        ))}
      </div>
      {draft.destMode === "later" && !city && recs.length > 0 ? (
        <div className="wm-chips">
          {recs.map((c) => (
            <button
              key={c.id}
              type="button"
              className="wm-chip"
              onClick={() =>
                setDraft((d) => ({ ...d, cityId: c.id, destMode: "picked" }))
              }
            >
              {c.name} · {c.slogan.title}
            </button>
          ))}
        </div>
      ) : null}
      {dateIssue ? (
        <div className="date-issue" role="alert" data-testid="wm-date-issue">
          <p className="date-issue-title">前后矛盾了，先对一下口径</p>
          <p className="date-issue-msg">{dateIssue.message}</p>
          <div className="date-issue-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={onApplyDateFix}
            >
              {dateIssue.fixLabel}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={onIgnoreDateFix}
            >
              仍按当前口径生成
            </button>
          </div>
        </div>
      ) : null}
      <div className="wm-nav">
        <button type="button" className="btn-link" onClick={() => onJump(0)}>
          ← 从头再跳一遍
        </button>
        <button
          type="button"
          className="btn-primary wm-cta-main"
          data-testid="wm-generate"
          onClick={onStart}
          disabled={!canGenerate}
        >
          {canGenerate ? "生成我的行程 →" : "先选一座目的地城市"}
        </button>
      </div>
    </div>
  );
}

interface StepCtx {
  draft: JourneyDraft;
  set: (patch: Partial<JourneyDraft>) => void;
  onNext: () => void;
  onSkip?: () => void;
  onBack: () => void;
}

/** 该站是否是「跳过 / 不确定」过去的（路径上画问号） */
function draftSkipped(key: StepKey, d: JourneyDraft): boolean {
  switch (key) {
    case "time":
      return d.timeMode === "undecided";
    case "origin":
      return d.origin.trim() === "";
    case "dest":
      return d.destMode === "later" && !d.cityId;
    case "days":
      return d.days === null;
    case "style":
      return d.styles.length === 0;
    case "extras":
      return (
        !d.companions && !d.pace && !d.budget && !d.freeText && !d.driveHours
      );
    default:
      return false;
  }
}

/* ── 世界地图画布：经纬网 + 发光路径 + 可点节点 ─────────── */

/**
 * 首页的探索地图：中国地图 + 七个路标 + 跳跃的小旅行家。
 *
 * 状态只从 draft / step 推导，不另存一份 —— 所以「回到上一站改答案」不会丢已经填过的东西。
 * 地图上的节点与行程卡片共用同一份坐标数据（STATIONS / cities），不会各说一套。
 */
function ExploreMap({
  step,
  city,
  onJump,
}: {
  step?: number;
  city?: CityInfo | null;
  onJump?: (i: number) => void;
}) {
  const places = useMemo<MapPlace[]>(() => {
    const list: MapPlace[] = STATIONS.map((st) => ({
      id: `st-${st.key}`,
      name: st.city,
      lat: st.lat,
      lng: st.lng,
      note: st.note,
    }));
    if (city) {
      list.push({
        id: `dest-${city.id}`,
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        note: `已选目的地 · ${city.province} · ${city.slogan.title}`,
      });
    }
    return list;
  }, [city]);

  const states = useMemo(() => {
    const out: Record<string, MapPinState> = {};
    STATIONS.forEach((st, i) => {
      out[`st-${st.key}`] =
        step === undefined
          ? "explore"
          : i < step
            ? "visited"
            : i === step
              ? "current"
              : "explore";
    });
    if (city) out[`dest-${city.id}`] = "end";
    return out;
  }, [step, city]);

  const curIdx = step === undefined ? 0 : Math.min(step, STATIONS.length - 1);
  const hopperId = `st-${STATIONS[curIdx].key}`;

  return (
    <ChinaMap
      places={places}
      states={states}
      links
      linkCount={step === undefined ? 1 : Math.min(step + 1, STATIONS.length)}
      hopperId={hopperId}
      hopToken={step ?? 0}
      forceWholeCountry
      variant="stage"
      caption={
        step === undefined
          ? "中国 · 七个探索路标"
          : `第 ${curIdx + 1} 站 · ${STATIONS[curIdx].city}`
      }
      onSelect={
        onJump
          ? (id) => {
              const i = STATIONS.findIndex((st) => `st-${st.key}` === id);
              // 只允许回跳到走过的路标，前面的路标保持「待探索」
              if (i >= 0 && step !== undefined && i <= step) onJump(i);
            }
          : undefined
      }
    />
  );
}
