// ==UserScript==
// @name         学习通UEditor粘贴&复制解锁（增强优化版）
// @namespace    https://tampermonkey.net/
// @version      2.2
// @description  强制解除学习通粘贴/复制/剪切/右键限制，采用全局捕获+UEditor Hook双重机制
// @author       Gemini
// @match        *://*.chaoxing.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 核心逻辑：解除粘贴 / 复制 / 剪切拦截
     * @param {ClipboardEvent} e
     */
    const unlockClipboard = (e) => {
        if (e) {
            // 阻止学习通自己的脚本拦截剪贴板事件
            e.stopImmediatePropagation();
            // 设置 returnValue 确保某些旧逻辑放行
            e.returnValue = true;
        }
        return true;
    };

    // 解除右键菜单拦截（方便右键复制）
    const unlockContextMenu = (e) => {
        if (e) {
            e.stopImmediatePropagation();
            e.returnValue = true;
        }
        return true;
    };

    // 阻止页面通过 oncopy / onpaste / oncontextmenu 等内联属性拦截
    const blockInlineHandlers = () => {
        ['oncopy', 'onpaste', 'oncut', 'oncontextmenu', 'onselectstart', 'ondragstart'].forEach(attr => {
            try {
                document.documentElement[attr] = null;
                document.body && (document.body[attr] = null);
            } catch (err) {}
        });
    };

    // 1. 全局监听捕获（在脚本运行初期就占领高地）
    ['paste', 'copy', 'cut'].forEach(evt => {
        window.addEventListener(evt, unlockClipboard, true);
        document.addEventListener(evt, unlockClipboard, true);
    });
    document.addEventListener('contextmenu', unlockContextMenu, true);
    document.addEventListener('selectstart', unlockClipboard, true);
    document.addEventListener('dragstart', unlockClipboard, true);

    /**
     * 针对 UEditor 编辑器的深度 Hook
     */
    const hookUEditor = () => {
        blockInlineHandlers();

        // 覆盖可能存在的全局拦截变量
        if (window.editorPaste) {
            window.editorPaste = () => true;
        }
        if (window.editorCopy) {
            window.editorCopy = () => true;
        }

        // 检查页面是否存在 UEditor 实例
        if (window.UE && window.UE.instants) {
            Object.values(window.UE.instants).forEach(editor => {
                // 使用标记位防止重复 Hook
                if (!editor.__unlocked) {
                    try {
                        // 移除所有内置的粘贴 / 复制 / 剪切监听器
                        ['beforepaste', 'paste', 'beforecopy', 'copy', 'beforecut', 'cut'].forEach(evt => {
                            editor.removeAllListeners(evt);
                        });

                        // 直接重写编辑器 Body 的粘贴 / 复制 / 剪切处理
                        if (editor.body) {
                            editor.body.onpaste = (e) => { if (e) e.stopImmediatePropagation(); };
                            editor.body.oncopy  = (e) => { if (e) e.stopImmediatePropagation(); };
                            editor.body.oncut   = (e) => { if (e) e.stopImmediatePropagation(); };
                            editor.body.oncontextmenu = null;
                            editor.body.onselectstart = null;
                        }
                        editor.__unlocked = true;
                    } catch (err) {
                        // 捕获异常，防止脚本崩溃
                    }
                }
            });
        }
    };

    // 2. 轮询检查：应对异步加载或多层 Iframe
    setInterval(() => {
        hookUEditor();

        // 扫描并解锁 Iframe 内部的剪贴板 / 右键限制
        document.querySelectorAll('iframe').forEach(ifr => {
            try {
                const targetWin = ifr.contentWindow;
                if (targetWin) {
                    ['paste', 'copy', 'cut'].forEach(evt => {
                        targetWin.addEventListener(evt, unlockClipboard, true);
                    });
                    targetWin.addEventListener('contextmenu', unlockContextMenu, true);
                    targetWin.document && targetWin.document.addEventListener('selectstart', unlockClipboard, true);
                }
            } catch(e) {
                // 跨域 Iframe 无法操作，正常忽略
            }
        });
    }, 1500);

    console.log('%c✅ 学习通粘贴&复制解锁插件已激活！', 'color: white; background: #2ecc71; padding: 4px 8px; border-radius: 4px;');
})();
