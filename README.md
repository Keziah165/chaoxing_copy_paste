# 学习通UEditor粘贴&复制解锁（增强优化版）
> 油猴(Tampermonkey)脚本，解除超星学习通UEditor编辑器复制、粘贴、右键、选中文本限制，支持iframe嵌套页面。

[![Greasy Fork](https://img.shields.io/badge/GreasyFork-UserScript-green)](https://greasyfork.org/)
[![Version](https://img.shields.io/badge/Version-2.2-blue)]()

## 📝 项目简介
超星学习通部分作业、讨论、笔记页面会禁用复制、粘贴、右键菜单、文本选中，导致无法复制题目内容、也无法粘贴自己写好的文本到编辑器。

本脚本采用**全局事件捕获 + UEditor深度Hook + Iframe轮询解锁**三重机制，绕过页面剪贴板拦截，解除学习通的复制粘贴限制。

> ⚠️ **重要提醒**
> 本脚本仅用于个人学习研究，请遵守学校考试、作业相关规定，禁止用于抄袭作弊，使用产生一切后果由使用者自行承担。

## ✨ 功能特性
- ✅ 解除页面 `复制 / 粘贴 / 剪切` 剪贴板事件拦截
- ✅ 恢复鼠标右键菜单功能
- ✅ 解除文本选中、拖拽复制限制
- ✅ 深度Hook UEditor富文本编辑器，移除编辑器内部粘贴复制拦截
- ✅ 自动轮询适配异步加载页面
- ✅ 自动处理页面内iframe嵌套编辑器场景
- ✅ 防止脚本重复Hook，避免页面报错崩溃
- ✅ `@run-at document‑start` 页面最早时机注入抢占事件

## 🛠️ 安装方式
### 方式1：Tampermonkey手动安装
1. 浏览器安装油猴扩展 Tampermonkey / Violentmonkey
2. 新建脚本，把 `chaoxing‑ueditor‑unlock.user.js` 的全部代码复制粘贴进去
3. Ctrl+S保存脚本，访问学习通页面自动生效

### 方式2：导入脚本文件
将本仓库内的 `chaoxing‑ueditor‑unlock.user.js` 在油猴面板选择导入文件即可。

## 📂 文件说明
```
.
├── chaoxing-ueditor-unlock.user.js   # 油猴主脚本
└── README.md                         # 项目说明文档
```

## 🧪 使用说明
1. 脚本开启后，打开学习通作业/讨论/笔记编辑页面
2. 浏览器控制台（F12）会输出绿色日志 `✅ 学习通粘贴&复制解锁插件已激活！` 代表脚本正常运行
3. 正常使用Ctrl+C复制、Ctrl+V粘贴，鼠标右键复制文本
> 如果编辑器还是无法粘贴，刷新页面即可；部分跨域iframe浏览器安全限制无法处理，属于浏览器固有限制。

## ⚠️ 限制与已知问题
1. **跨域iframe**：浏览器安全策略，脚本无法操作跨域嵌套iframe，这是浏览器限制，脚本无法解决。
2. 学习通更新页面JS后有可能会导致脚本失效，可以提交issue反馈。
3. **本脚本仅解除浏览器层面剪贴板限制，不会绕过学校后台防作弊校验，请勿用于抄袭作业。**

## 📜 License
MIT License

## 🙋 反馈
发现失效、bug可以提交 Issue。

---

### 如果你需要，我可以顺便帮你生成一个简单的github仓库简介（About）：
> Tampermonkey userscript for chaoxing(超星学习通). Unblock copy/paste/right‑click for UEditor rich text editor. For study only, no cheating.

需要我把脚本文件也帮你整理好可以直接复制的完整文件文本吗？直接复制保存成 `.user.js` 就能上传github。