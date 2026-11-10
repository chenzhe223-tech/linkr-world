// 记忆语义标记：两道相向的弧线（两位相遇的人）与中间的一点（那一刻）。
// Remember 语义色取品牌色板：梅紫 #7C5A82，落点为日落赭金 #DBB27A。

interface RememberMarkProps {
  size?: number;
}

export function RememberMark({ size = 28 }: RememberMarkProps) {
  return (
    <svg
      viewBox="0 0 34 26"
      height={size}
      width={(size * 34) / 26}
      role="img"
      aria-label="世界记忆"
    >
      <path
        d="M13 3.5 A 10.5 10.5 0 0 0 13 22.5"
        fill="none"
        stroke="#7C5A82"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M21 3.5 A 10.5 10.5 0 0 1 21 22.5"
        fill="none"
        stroke="#7C5A82"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="17" cy="13" r="2.7" fill="#DBB27A" />
    </svg>
  );
}
