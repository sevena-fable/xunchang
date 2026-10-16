// 信纸款式定义 —— 4 款真图信纸，写信和读信共用
// key 存进数据库的 stationery 字段
//
// lines 是"横线在图里的位置"（占图片高度的百分比），是用脚本逐像素量出来的：
// 读信时每一行字就按这些位置骑在线上，换哪台电脑都严丝合缝。
// text 是文字区的左右边界（占图片宽度的百分比）。
export const PAPER_RATIO = 880 / 1232 // 信纸图的宽高比（竖长 5:7）

export const STATIONERY = {
  cream: {
    label: '米白',
    image: '/paper-cream.jpg',
    ink: '#4a4358',
    // 下面三个色值给"色盘小圆点 / 面板里的小点 / 写信横线"用
    paper: '#f7f2ee',
    border: '#bac3d4',
    lines: [18.02, 22.61, 27.19, 31.74, 36.36, 41.11, 46.14, 51.14, 56.17, 61.16, 66.19, 71.10, 75.73, 80.48, 85.43, 89.89],
    text: { left: 13, right: 87 },
  },
  sky: {
    label: '淡蓝',
    image: '/paper-sky.jpg',
    ink: '#4a5366',
    paper: '#edf0f4',
    border: '#bac3d4',
    lines: [18.34, 22.32, 26.30, 30.28, 34.29, 38.31, 42.37, 46.43, 50.57, 54.63, 58.69, 62.74, 66.80, 70.86, 74.96, 79.02, 83.16, 87.26],
    text: { left: 13, right: 87 },
  },
  green: {
    label: '豆绿',
    image: '/paper-green.jpg',
    ink: '#4f5a52',
    paper: '#eff2ec',
    border: '#bcc8bc',
    lines: [16.76, 20.74, 24.88, 28.86, 33.08, 36.93, 41.11, 45.29, 49.51, 53.49, 57.63, 61.93, 66.15, 70.17, 74.15, 78.21, 82.18, 86.24, 90.14],
    text: { left: 14, right: 86 },
  },
  pink: {
    label: '樱粉',
    image: '/paper-pink.jpg',
    ink: '#5e4a56',
    paper: '#f7eef0',
    border: '#d8b4b6',
    lines: [19.60, 23.62, 27.68, 31.70, 35.71, 39.73, 43.71, 47.77, 51.83, 55.84, 59.86, 63.88, 67.90, 71.96, 75.97, 79.99, 84.05, 88.11],
    text: { left: 13, right: 87 },
  },
}

// 旧款式的信还躺在数据库里：显示时落到最接近的新款，不报错也不丢
const LEGACY = { kraft: 'green', night: 'sky' }

// 拿不到时的兜底款
export function getStationery(key) {
  return STATIONERY[key] || STATIONERY[LEGACY[key]] || STATIONERY.cream
}
