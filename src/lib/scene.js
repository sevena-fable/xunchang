// 窗台场景的"地图"与"时间语言"
// —— 热区坐标：按背景图 1672x941 换算成百分比，所以任何屏幕尺寸下都对得上物件
// —— 四时：现实时间决定画面色调（规则 6.2），台灯白天灭、夜里亮（规则 6.3）

// ===== 四时时段 =====
// 第一版只有一张白天母版图，早晨/黄昏/夜晚用色调层模拟。
// 将来拿到 AI 出的另外三张图，只需把这里的 image 换成对应文件名、并把 filter/overlay 设为 null。
export const SCENES = {
  morning: {
    label: '早晨',
    image: '/bg-window-day.jpg',
    // 晨光：清透、薄雾、太阳角度低 —— 光从窗子右上斜切进来（雾只要一层，颜色要留着）
    filter: 'brightness(1.05) saturate(0.95) hue-rotate(-8deg) contrast(0.97)',
    // 三层叠：① 右上斜射的一道金光 ② 远景的乳白晨雾 ③ 屋内尚未散尽的一点冷意
    overlay: [
      'linear-gradient(212deg, rgba(255,234,180,0.46) 0%, rgba(255,244,214,0.18) 32%, rgba(255,255,255,0) 58%)',
      'linear-gradient(180deg, rgba(246,250,255,0.26) 0%, rgba(252,252,250,0.1) 26%, rgba(255,255,255,0) 46%)',
      'linear-gradient(0deg, rgba(206,220,240,0.14) 0%, rgba(255,255,255,0) 40%)',
    ].join(','),
    overlayBlend: 'screen',
    lampOn: false,
    // 落在桌面的光斑颜色
    glow: 'rgba(255, 244, 214, 0.62)',
    poem: '晨光刚落到窗台上',
  },
  day: {
    label: '白天',
    image: '/bg-window-day.jpg',
    filter: null,
    overlay: null,
    overlayBlend: null,
    lampOn: false,
    glow: 'rgba(255, 236, 179, 0.55)',
    poem: '风把树叶翻过来又翻过去',
  },
  dusk: {
    label: '黄昏',
    image: '/bg-window-day.jpg',
    // 晚霞：滤镜只负责把光压低、把绿叶推成金色；
    // 天空那一块光靠上面单独盖一层橘色霞光（不用混合模式，直接染），比光靠 filter 可靠
    filter: 'brightness(0.92) saturate(1.24) hue-rotate(-16deg) sepia(0.12) contrast(1.04)',
    overlay: [
      // ① 天上的霞光：上浓下淡，到了屋里就散尽了
      'linear-gradient(180deg, rgba(255,126,68,0.42) 0%, rgba(255,152,88,0.32) 24%, rgba(255,180,124,0.16) 42%, rgba(255,192,134,0.04) 54%, rgba(255,192,134,0) 60%)',
      // ② 太阳落在山那一端，地平线上一团亮
      'radial-gradient(ellipse 52% 22% at 42% 47%, rgba(255,204,120,0.38) 0%, rgba(255,190,110,0) 72%)',
      // ③ 屋里先暗下来，落一层蓝紫的暮色
      'linear-gradient(0deg, rgba(88,62,104,0.24) 0%, rgba(88,62,104,0.08) 22%, rgba(88,62,104,0) 38%)',
    ].join(','),
    overlayBlend: 'normal',
    lampOn: false,
    glow: 'rgba(255, 178, 112, 0.72)',
    poem: '太阳把整间屋子照成了蜜糖的颜色',
  },
  night: {
    label: '夜晚',
    image: '/bg-window-day.jpg',
    // 夜色：压暗、去饱和、偏冷蓝 —— 但要留住桌面的可读性，靠台灯把物件捞回来
    filter: 'brightness(0.46) saturate(0.5) hue-rotate(202deg) contrast(1.12)',
    overlay: [
      'radial-gradient(ellipse at 40% 20%, rgba(60,92,150,0.22) 0%, rgba(20,32,64,0.5) 60%, rgba(14,22,48,0.62) 100%)',
      'linear-gradient(180deg, rgba(10,20,52,0.5) 0%, rgba(14,24,52,0.44) 55%, rgba(22,26,46,0.42) 100%)',
    ].join(','),
    overlayBlend: 'multiply',
    lampOn: true,
    glow: 'rgba(255, 214, 138, 0.75)',
    poem: '夜深了，台灯替你留着一盏光',
  },
}

// 现实时间 → 时段（规则 6.2 的默认区间，可调）
export function currentScene(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60
  if (h >= 5 && h < 9) return 'morning'
  if (h >= 9 && h < 17) return 'day'
  if (h >= 17 && h < 19.5) return 'dusk'
  return 'night'
}

// ===== 桌面物件热区（百分比，对应背景图 1672x941）=====
// left/top/width/height 都是相对画面的百分比；label 是悬停时的提示
export const HOTSPOTS = {
  lamp: {
    label: '台灯',
    hint: '它随天色自己亮灭',
    left: 2.4, top: 36.5, width: 15.5, height: 22,
    decorative: true,
  },
  books: {
    label: '书',
    hint: '还没想好要读哪一本',
    left: 3.6, top: 58.5, width: 13.5, height: 27,
    decorative: true,
  },
  bell: {
    label: '铃铛',
    hint: '摇一摇，唤鸽子回来',
    left: 21.5, top: 77.5, width: 8.5, height: 21,
  },
  envelope: {
    label: '桌上的信',
    hint: '看看有没有新的信',
    left: 42, top: 66.5, width: 15.5, height: 19,
  },
  paper: {
    label: '钢笔与信纸',
    hint: '写一封信',
    left: 36, top: 84, width: 28, height: 16,
  },
  calendar: {
    label: '台历',
    hint: '翻一翻那些通信的日子',
    left: 69.5, top: 62.5, width: 12, height: 23,
  },
  cup: {
    label: '茶杯',
    hint: '听一点窗外的声音',
    left: 78.5, top: 79.5, width: 9, height: 17,
  },
}

// 鸽子站在窗台木沿上的位置（百分比）
// 调参依据：窗沿面 y≈718px（脚底）；水平上卡在信封木托与台历之间的空位
export const PIGEON_PERCH = { left: 58, bottom: 23.7, height: 20 }

// 窗外天空区域（云朵漂移的活动范围）
export const SKY_AREA = { left: 19, top: 3, width: 54, height: 44 }

// 夜晚：窗外远处小镇的灯火（百分比坐标）
// 坐标是对着背景图量的：湖对岸一小簇 + 镇中心一大簇 + 教堂尖顶那一带
// 每盏灯亮度不同、闪烁节奏不同，看起来才像真有人在里面过日子
export const VILLAGE_LIGHTS = [
  [29.5, 51.4], [32.4, 51.9], [35.2, 51.2], [37.9, 52.1],
  [42.4, 54.3], [45.0, 55.6], [47.8, 56.5], [50.2, 55.1], [52.6, 57.1], [55.0, 55.7],
  [57.4, 53.5], [58.3, 57.9], [59.8, 51.6], [61.8, 54.7], [63.4, 56.9],
  [49.4, 58.3],
]
