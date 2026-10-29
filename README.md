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
- **阅读与回应**：对方打开后可翻页阅读，留下一个表情或 20 字以内的短评；每条内容只能回应一次。
- **按日期回看**：台历标记分享过内容的日子，也集中列出未读内容和旧版留存的未分享内容。
- **保存草稿**：正文、批注和照片暂存在当前浏览器，关闭面板后可继续编辑；多窗口同时打开时会保护正在编辑的草稿。

当前版本通过邮箱账号和邀请码建立两人的分享空间，内容在配对双方之间可见。主界面是固定的窗边阅读桌面，设置中可以修改昵称、开关背景音乐。

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
| `src/lib/` | 内容读写、排版、草稿、附件和场景配置 |
| `src/preview.jsx` | 无后端的本地演示 |
| `public/` | 背景、纸张、图标、音乐与字体许可文件 |
| `supabase/` | 数据库初始化与迁移脚本 |
| `scripts/` | 现有测试和素材处理脚本 |

当前背景为 `public/bg-main.jpg`。更换构图时，在 `src/lib/scene.js` 中调整背景比例和纸笔、台历两个热区的坐标，可通过预览工具的「热区」按钮检查。

## 项目文档

| 文档 | 内容 |
|------|------|
| [产品概览](docs/01-产品概览.md) | 阅读分享的定位、体验和文案约定 |
| [功能规则](docs/02-功能规则.md) | 分享、出处、批注、照片、阅读、回应和台历 |
| [MVP 边界](docs/03-MVP边界.md) | 当前范围与尚未提供的能力 |
| [技术方案](docs/04-技术方案.md) | 实际结构、数据语义、权限和历史兼容说明 |
| [维护方向](docs/05-开发路线图.md) | 后续工作的取舍依据 |
| [使用与验收](docs/06-使用与验收.md) | 本地体验步骤与验证清单 |

## 开源许可

源码与项目文档采用 [MIT License](LICENSE)。第三方字体及其封装遵循各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
