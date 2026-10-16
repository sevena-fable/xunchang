// 窗台场景的"剧本" —— 寻常版
// 现在主页面只有一张图，任何时段打开都是它；不再有四时切换。
// 热区只留两个：钢笔+信纸（写信）、台历（共同时间线）。
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

// 鸽子将来回来时站的位置（信鸽系统暂不启动，代码先留着）
export const PIGEON_PERCH = { left: 58, bottom: 23.7, height: 20 }
