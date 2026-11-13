# 寻常

> 读到喜欢的文字，分享给你。

「寻常」是一个分享日常阅读中遇到的文字的网站。书里的一段话、诗中的几行、文章里让你停下来的句子，都可以摘录下来，附上出处和自己的批注，分享给对方。

文字在纸页上展开，读过的内容按日期留在台历里，方便日后再翻看。

仓库：[sevena-fable/xunchang](https://github.com/sevena-fable/xunchang) · 许可证：[MIT](LICENSE)

![寻常的窗边阅读桌面](public/bg-main.jpg)

## 现在可以做什么

- **分享文字**：从桌面上的纸笔进入「给你看看」，输入或粘贴读到的内容，保留段落、空行和标点。
- **附上出处**：填写作品与作者、链接或页码，将出处插入正文末尾；之后仍可直接编辑。
- **留下批注**：分享前选中原文并右键，为某一句添加想法。批注随正文一起分享，阅读时可点开查看。
- **添加照片**：每条内容最多附 3 张照片，每张不超过 6MB，支持 JPG、PNG、WebP 和 GIF。
- **阅读与回应**：对方打开后可翻页阅读，选中原文右键添加鼠尾草绿批注回复，也可留下表情或文字回应。批注回复与分享者暖金色批注重叠时显示赭米色；普通回应每条内容一次。
- **按日期回看**：台历标记分享过内容的日子，也集中列出未读内容和旧版留存的未分享内容。
- **保存草稿**：正文、批注和照片暂存在当前浏览器，关闭面板后可继续编辑；多窗口同时打开时会保护正在编辑的草稿。
- **给对方留一首歌**：在设置里拖入或选择音频文件即可保存，也可以拖入或粘贴 HTTPS 音频直链。歌曲会留在列表里，直到送出的人移除。对方打开网站时可以选择播放或跳过，一首时单曲循环，多首时按留下的顺序循环。

当前版本通过邮箱账号和邀请码建立两人的分享空间，内容在配对双方之间可见。每个人独自生活在自己的森林小屋里，通过书信与对方联系。主页从屋外信箱进入客厅，再来到窗边书桌；设置中可以修改昵称、开关背景音乐。

当前以电脑浏览器为主。纸页编辑与阅读需要至少 900 × 600 的浏览器视口，窗口过小时会提示放大或全屏。

## 本地运行

需要 Node.js 22 或更新的 LTS 版本。

```bash
git clone https://github.com/sevena-fable/xunchang.git
cd xunchang
npm ci
```

将 `.env.example` 复制为 `.env.local`，填入自己 Supabase 项目的 URL 和客户端 anon key，并按下方顺序初始化数据库。

```bash
npm run dev
```

- 正式页面：[http://localhost:5173/](http://localhost:5173/)，需要 Supabase 配置。
- 本地预览：[http://localhost:5173/preview.html](http://localhost:5173/preview.html)，使用演示摘录，可预览分享、出处、批注、照片、阅读、台历和设置，无需连接数据库。
- 小屋预览：[http://localhost:5173/preview.html?cabin=1](http://localhost:5173/preview.html?cabin=1)，可用演示信件试走屋外信箱、客厅、桌面的完整动线。
- 登录界面预览：[http://localhost:5173/preview.html?entry=1](http://localhost:5173/preview.html?entry=1)，可查看登录、注册与找回密码界面，无需连接数据库。

Supabase Auth 的 Site URL 和允许跳转地址需包含实际访问地址；本地为 `http://localhost:5173`。前端环境变量使用客户端 anon key，服务端 service role key 应留在服务端。

## 数据库初始化

在 Supabase SQL Editor 中按顺序执行，每个脚本执行一次：

| 顺序 | 脚本 | 用途 |
|------|------|------|
| 1 | `supabase/phase1-tables.sql` | 用户资料和配对空间；包含历史版本的兼容表 |
| 2 | `supabase/phase2-letters.sql` | 分享内容的基础表与权限 |
| 3 | `supabase/phase6-extras.sql` | 照片字段、回应表与图片存储桶 |
| 4 | `supabase/phase7-reliability.sql` | 当前内容权限、私有图片存储、配对及分享状态操作 |
| 5 | `supabase/migrations/20261024005756_letter_annotations.sql` | 原文选区批注 |
| 6 | `supabase/migrations/20261029053457_remove_annotation_limit.sql` | 取消旧版批注长度上限 |
| 7 | `supabase/migrations/20261030090000_annotation_replies.sql` | 阅读者的原文批注回复及权限 |
| 8 | `supabase/migrations/20261030100000_remove_reaction_note_limit.sql` | 取消普通文字回应长度限制 |
| 9 | `supabase/migrations/20261111014850_song_gifts.sql` | 配对留歌、入站提醒与私有音频存储 |
| 10 | `supabase/migrations/20261111074621_persistent_song_gifts.sql` | 留歌列表、歌曲名称和发送方移除权限 |

`supabase/phase3-pigeon.sql` 只补充旧信鸽模块的结构，当前阅读分享流程无需执行。

请完整执行上表步骤后再使用正式页面。已有数据库升级前应先备份并核对现有结构和策略。`phase7-reliability.sql` 含有旧图片 URL 的迁移前缀，迁移已有图片时需替换为自己的 Supabase 项目域名；全新数据库没有旧图片，无需替换。

数据库的 `letters`、`letter-images` 以及部分组件文件名沿用了历史命名，当前承载的是分享内容与附件。相关字段、状态和迁移的对应关系见[技术方案](docs/04-技术方案.md)。仓库保留的旧信鸽模块未接入当前页面。

## 构建与验证

```bash
npm run build
npm test
```

现有测试覆盖文字排版、草稿、出处、批注、照片、分享、回应和数据库权限。浏览器测试在 Windows 上默认使用已安装的 Microsoft Edge；其他平台可先运行 `npx playwright install chromium`。

## 技术与目录

- 前端：React、Vite、Tailwind CSS、Framer Motion。
- 后端：Supabase Auth、PostgreSQL、Storage、Realtime。
- 字体：Noto Serif SC、霞鹜文楷；音频使用浏览器原生能力。
- 部署：Vercel。

| 目录或文件 | 内容 |
|------------|------|
| `src/pages/` | 登录、配对、阅读桌面 |
| `src/components/` | 纸页、分享、阅读、出处、批注、台历和设置 |
| `src/components/cabin/` | 小屋模型、三个镜头、物件热区与视角控制 |
| `src/lib/` | 内容读写、排版、草稿、附件和场景配置 |
| `src/preview.jsx` | 无后端的本地演示 |
| `public/` | 背景、纸张、图标、音乐与字体许可文件 |
| `supabase/` | 数据库初始化与迁移脚本 |
| `scripts/` | 现有测试和素材处理脚本 |

配对后的主页默认在屋外。拖拽转向，滚轮、双指捏合或底部按钮缩放，点信箱看来信，点门进屋，再点桌子进入近景。未读来信会让信鸽在屋外飞来停靠，读完最后一封后离开。书桌上的黑胶唱机可以开关背景音乐，进站时选择「先不听」也可稍后从唱机播放已加载的留歌。键盘进屋时，焦点会随镜头移到下一层可用的物件。

三个镜头共用 `cabin/model.js` 的同一套几何和物件坐标。`cabin/runtime.js` 负责镜头、物件动画及投影热区。没有 WebGL 时，`public/cabin/` 提供对应的横屏和竖屏场景图，仍可操作信箱、书桌和台历。纸张读写界面需要至少 900 × 600 的窗口。原静态桌面可从旧预览入口查看。

树林的分枝与叶片在 `cabin/forest.js` 中批量生成。木材、树皮与地面使用本地颜色、法线和粗糙度贴图，来源记录在 `public/cabin/materials/SOURCES.md`。贴图完成加载后场景会重绘，下载失败的贴图使用中性值，保留场景交互。

场景采用晴朗午后的暖色阳光与远处薄雾。`cabin/garden.js` 批量生成露台和小路边的花丛、攀缘玫瑰，以及书桌上的一小瓶花；窗帘与书桌保持在同一空间中。花园使用固定随机种子，三个视角和备用图中的植物位置一致。这些装饰不增加业务热区，也不启动持续渲染循环。

小屋正在按森林木屋参考图重建。当前结构阶段采用左前方低机位、原木立板、灰色屋瓦、三角窗及带百叶烟帽的烟囱。`cabin/architecture.js` 统一建筑比例与参考相机，模型、室内相机和热点使用同一个坐标变换。外墙使用独立木板贴图，室内与露台保持原有木质布局。完整阶段与验收标准见[参考图重建计划](docs/08-小屋参考图重建计划.md)。目前仍是结构阶段稿，植被和光照尚未达到参考图质量。

## 项目文档

| 文档 | 内容 |
|------|------|
| [产品概览](docs/01-产品概览.md) | 阅读分享的定位、体验和文案约定 |
| [功能规则](docs/02-功能规则.md) | 分享、出处、批注、照片、阅读、回应和台历 |
| [MVP 边界](docs/03-MVP边界.md) | 当前范围与尚未提供的能力 |
| [技术方案](docs/04-技术方案.md) | 实际结构、数据语义、权限和历史兼容说明 |
| [维护方向](docs/05-开发路线图.md) | 后续工作的取舍依据 |
| [使用与验收](docs/06-使用与验收.md) | 本地体验步骤与验证清单 |
| [批注回复验收](docs/07-批注回复验收.md) | 双方视角、鼠尾草绿回复与赭米色重叠配色 |

## 开源许可

源码与项目文档采用 [MIT License](LICENSE)。第三方字体及其封装遵循各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
