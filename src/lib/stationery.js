// 信纸款式定义 —— 4 款，写信和读信共用同一套配色
// key 存进数据库的 stationery 字段；其余是显示用的样式
export const STATIONERY = {
  cream: {
    label: '米白',
    // 纸张背景、文字颜色、边框（用 Tailwind 内联样式的十六进制值，方便统一管理）
    paper: '#faf6ee',
    ink: '#5b4b3a',
    border: '#e8dcc8',
  },
  sky: {
    label: '淡蓝',
    paper: '#eef5fb',
    ink: '#3a5266',
    border: '#cfe0ef',
  },
  kraft: {
    label: '牛皮纸',
    paper: '#e9dcc4',
    ink: '#5a4630',
    border: '#d2bd97',
  },
  night: {
    label: '夜空',
    paper: '#2b3550',
    ink: '#e6ecf7',
    border: '#3f4c6e',
  },
}

// 拿不到时的兜底款
export function getStationery(key) {
  return STATIONERY[key] || STATIONERY.cream
}
