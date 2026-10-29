// 寻常的窗边阅读桌面：背景与点击热区配置。
// 现在主页面只有一张图，任何时段打开都是它；不再有四时切换。
// 热区只留两个：纸笔（分享阅读摘录）、台历（按日期回看）。
// 坐标是占整张图的百分比，对着预览台的"热区"开关调出来的。

export const BG_MAIN = '/bg-main.jpg'

// 画面比例：原图实测 1925x1066
export const FRAME_RATIO = 1925 / 1066

export const HOTSPOTS = {
  paper: {
    label: '给你看看',
    left: 25, top: 69, width: 50, height: 28,
  },
  calendar: {
    label: '台历',
    left: 14.5, top: 45.5, width: 9, height: 26,
  },
}

// 历史信鸽组件的兼容坐标，当前阅读桌面未使用。
export const PIGEON_PERCH = { left: 58, bottom: 23.7, height: 20 }
