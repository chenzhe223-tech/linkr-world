import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 只打包 latin 子集：中文字形交给系统字体（PingFang SC / Microsoft YaHei），
// 避免把 devanagari 等无用子集塞进产物，国内网络下加载更快。
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import './styles/global.css';
import App from './App';

const el = document.getElementById('root');
if (!el) {
  throw new Error('找不到 #root 挂载点');
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);
