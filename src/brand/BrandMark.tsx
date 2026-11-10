// Encounter R — 品牌主标识（视觉系统 v4 · 旅行手账暖色）
// 两条渐变轨迹 = 两条航线，也是两个旅人；在 R 的腰部交汇于一颗白色星点；
// 相遇之后，共同走向同一条斜腿。渐变：焦糖金 #DBB27A → 黛蓝 #0B3A5B → 深黛 #0A2E48。

interface BrandMarkProps {
  /** 渲染高度（px），宽度按比例自适应 */
  height?: number;
  /** 兼容旧调用点：无论取值如何，深空底上统一使用 Aurora 渐变 */
  tone?: 'blue' | 'paper';
  className?: string;
}

const VIEW_W = 30;
const VIEW_H = 30;

let uid = 0;

export function BrandMark({ height = 30, className }: BrandMarkProps) {
  // 同页多实例时保证渐变 id 唯一
  const gid = `lr-aurora-${++uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      height={height}
      width={(height * VIEW_W) / VIEW_H}
      className={className}
      role="img"
      aria-label="Link-R World 标识：Encounter R"
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#DBB27A" />
          <stop offset="52%" stopColor="#0B3A5B" />
          <stop offset="100%" stopColor="#0A2E48" />
        </linearGradient>
      </defs>
      {/* 竖笔 */}
      <path
        d="M22.4 13.5 L22.4 47"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="3.3"
        strokeLinecap="round"
      />
      {/* 弧区（第一条轨迹，从青绿光点出发） */}
      <path
        d="M16 19.5 C17.5 10.8 29 7.3 36 10.4 C41.5 12.8 43.5 18.3 40.5 22.9 C37.8 26.9 34 28.7 30.3 29.7"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* 斜腿（第二条轨迹：相遇后共同向下） */}
      <path
        d="M51.5 17.5 C48.2 25.6 40.2 29.3 31.7 30.2 L41.7 47"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="3.3"
        strokeLinecap="round"
      />
      {/* 旅人光点一（金端） */}
      <circle cx="16" cy="19.5" r="1.7" fill="#DBB27A" />
      {/* 旅人光点二（黛蓝端） */}
      <circle cx="51.5" cy="17.5" r="2.1" fill="#0A2E48" />
      {/* 相遇星点 */}
      <circle cx="31.7" cy="30.1" r="1.5" fill="#FFFFFF" />
      <circle cx="31.7" cy="30.1" r="3.6" fill="#FFFFFF" opacity="0.16" />
    </svg>
  );
}

interface WordmarkProps {
  tone?: 'blue' | 'paper';
  showTag?: boolean;
}

export function Wordmark({ showTag = true }: WordmarkProps) {
  return (
    <span className="brand-lockup">
      <BrandMark height={30} />
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        <span className="brand-name">LINK-R WORLD</span>
        {showTag ? <span className="brand-tag">连接世界 · 遇见彼此</span> : null}
      </span>
    </span>
  );
}
