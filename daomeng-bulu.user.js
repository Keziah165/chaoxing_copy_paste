// ==UserScript==
// @name         到梦空间·成长记录补录·批量填表助手
// @namespace    local.daomeng.bulu
// @version      1.0.1
// @description  读取 xlsx 逐行填入「成长记录补录」弹窗，由人工核对后点“确认”，再自动处理下一条。
// @author       you
// @match        *://school.5idream.net/*
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
/*
 * 使用方法（二选一）：
 *  方式 A（推荐，一次安装长期可用）：
 *    1. 浏览器安装 Tampermonkey（油猴）扩展；
 *    2. 打开本文件，全选复制；在油猴里“添加新脚本”，粘贴覆盖，Ctrl+S 保存；
 *    3. 打开到梦空间管理端「成长记录管理」页面，右上角会出现“批量补录助手”面板。
 *  方式 B（临时，不装插件）：
 *    在该页面按 F12 打开控制台，把本文件全部内容粘贴进去回车即可（刷新页面后需重贴）。
 *
 * 操作流程：
 *    1) 点“选择 Excel 文件”，选你的 .xlsx；
 *    2) 下方列表会解析出所有“学号为纯数字”的行，示范行(如 100001)也会列出，请手动取消勾选；
 *    3) 点“开始”，脚本会自动点开“成长记录补录”弹窗并填好当前行；
 *    4) 你核对无误后手动点弹窗里的“确认”；脚本检测到弹窗关闭后自动进入下一条；
 *    5) 若点了“取消”或关闭弹窗，脚本会暂停，可点“继续”或在列表选其它行重新开始。
 * 说明：脚本只负责“填表”，不会替你点“确认”，加分与否由你把关。
 */
(function () {
  'use strict';
  if (window.__DM_BULU_LOADED__) {
    try { window.__DM_BULU_PANEL__ && window.__DM_BULU_PANEL__.remove(); } catch (e) {}
  }
  window.__DM_BULU_LOADED__ = true;

  /* ========================= 工具函数 ========================= */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function waitFor(fn, timeout = 6000, interval = 120) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        let r = null;
        try { r = fn(); } catch (e) { r = null; }
        if (r) { resolve(r); return; }
        if (Date.now() - start > timeout) { reject(new Error('等待超时')); return; }
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  // 让 Element Plus / Vue 能响应到值变化（v-model）
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normText(s) { return String(s == null ? '' : s).replace(/\s/g, ''); }

  // 模拟真实键入：对 Vue/Element Plus 受控输入（尤其日期选择器）最可靠
  function typeText(el, value) {
    value = String(value);
    el.focus();
    try { el.select(); } catch (e) {}
    let ok = false;
    try {
      // 优先用 execCommand，触发真实 input/beforeinput 事件，受控组件能正确更新模型
      ok = document.execCommand('insertText', false, value);
    } catch (e) { ok = false; }
    if (!ok) {
      // 兜底：原生 setter + 事件
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 加载 SheetJS（控制台粘贴方式下 @require 不生效，运行时注入）
  function loadXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('加载 xlsx 解析库失败，请检查网络'));
      document.head.appendChild(s);
    });
  }

  /* ========================= 表单定位 ========================= */
  // 当前打开的“成长记录补录”弹窗表单（通过“发放用户学号”标签识别，避开页面其它表单）
  function getDialogForm() {
    const labels = document.querySelectorAll('.el-form-item__label');
    for (const lab of labels) {
      if (normText(lab.textContent).replace(/:$/, '') === '发放用户学号') {
        const f = lab.closest('form');
        if (f) return f;
      }
    }
    return null;
  }
  function getDialogRoot() {
    const f = getDialogForm();
    return f ? f.closest('.el-dialog') : null;
  }
  // 按标签文字拿表单项容器
  function itemByLabel(form, labelText) {
    const t = normText(labelText).replace(/:$/, '');
    const labels = form.querySelectorAll('.el-form-item__label');
    for (const lab of labels) {
      if (normText(lab.textContent).replace(/:$/, '') === t) {
        return lab.closest('.el-form-item');
      }
    }
    return null;
  }

  /* ========================= 填表动作 ========================= */
  async function fillTextByLabel(form, label, value) {
    if (value === '' || value == null) return;
    const item = itemByLabel(form, label);
    if (!item) throw new Error('未找到字段：' + label);
    const input = item.querySelector('.el-form-item__content .el-input__inner')
      || item.querySelector('.el-form-item__content textarea');
    if (!input) throw new Error('字段无输入框：' + label);
    setNativeValue(input, String(value));
    input.blur && input.blur();
    await sleep(60);
  }

  // 开始/结束时间：参与时间表单项里有两个日期选择器（Element Plus 受控输入，需模拟真实键入）
  async function fillDates(form, start, end) {
    const item = itemByLabel(form, '参与时间');
    if (!item) throw new Error('未找到字段：参与时间');
    const editors = item.querySelectorAll('.el-date-editor .el-input__inner');
    if (!editors.length) throw new Error('未找到时间输入框');
    const ns = normalizeDate(start);
    const ne = normalizeDate(end);
    log(`参与时间：开始=${start}→${ns}，结束=${end || '(空)'}→${ne || '(空)'}`);
    if (ns) {
      typeText(editors[0], ns);
      editors[0].blur();
      editors[0].dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(150);
    }
    if (ne && editors[1]) {
      typeText(editors[1], ne);
      editors[1].blur();
      editors[1].dispatchEvent(new Event('blur', { bubbles: true }));
      await sleep(150);
    }
    // 回读校验：若值没写进去，记一条警告方便排查
    if (ns && editors[0] && !editors[0].value) log('⚠ 开始时间未写入，可能被组件清空，请检查日期格式');
    if (ne && editors[1] && !editors[1].value) log('⚠ 结束时间未写入，可能被组件清空，请检查日期格式');
  }

  // 下拉选择：点开下拉 -> 在弹出层里找到匹配项点击
  async function selectByLabel(form, label, target) {
    if (target === '' || target == null) return; // 留空让用户自己选
    const item = itemByLabel(form, label);
    if (!item) throw new Error('未找到下拉：' + label);
    const wrap = item.querySelector('.el-select__wrapper');
    if (!wrap) throw new Error('下拉不可点击：' + label);
    wrap.click();
    await sleep(200);
    const targetNorm = normText(target);
    let opt = null;
    try {
      opt = await waitFor(() => {
        const poppers = document.querySelectorAll('.el-select__popper');
        for (const p of poppers) {
          if (p.getAttribute('aria-hidden') === 'true') continue;
          if (getComputedStyle(p).display === 'none') continue;
          const items = p.querySelectorAll('.el-select-dropdown__item');
          for (const it of items) {
            if (normText(it.textContent) === targetNorm) return it;
          }
        }
        return null;
      }, 5000);
    } catch (e) {
      // 兜底：可搜索下拉，尝试输入过滤后选第一个
      const input = item.querySelector('.el-select__input');
      if (input) {
        setNativeValue(input, String(target));
        await sleep(400);
        const poppers = document.querySelectorAll('.el-select__popper');
        for (const p of poppers) {
          if (getComputedStyle(p).display === 'none') continue;
          const first = p.querySelector('.el-select-dropdown__item');
          if (first) { opt = first; break; }
        }
      }
    }
    if (opt) {
      opt.click();
      await sleep(250);
    } else {
      throw new Error('下拉中未找到选项：' + label + ' = ' + target);
    }
  }

  // 奖项：用“、”分隔多个，逐个填；多于 1 个时点“新增”加行
  async function fillAwards(form, awardsStr) {
    if (!awardsStr) return;
    const awards = String(awardsStr).split(/[、,，\n]/).map(s => s.trim()).filter(Boolean);
    if (!awards.length) return;
    const item = itemByLabel(form, '奖项');
    if (!item) throw new Error('未找到字段：奖项');
    const content = item.querySelector('.el-form-item__content');
    const addBtn = Array.from(content.querySelectorAll('button')).find(b => normText(b.textContent) === '新增');

    for (let i = 0; i < awards.length; i++) {
      const inputs = content.querySelectorAll('.el-input__inner');
      if (i < inputs.length) {
        setNativeValue(inputs[i], awards[i]);
        inputs[i].blur && inputs[i].blur();
      } else if (addBtn) {
        const before = content.querySelectorAll('.el-input__inner').length;
        addBtn.click();
        try {
          await waitFor(() => content.querySelectorAll('.el-input__inner').length > before, 3000);
        } catch (e) { throw new Error('奖项点“新增”后未出现新输入框'); }
        const now = content.querySelectorAll('.el-input__inner');
        setNativeValue(now[now.length - 1], awards[i]);
        now[now.length - 1].blur && now[now.length - 1].blur();
      }
      await sleep(80);
    }
  }

  // 学分：学分类型(下拉) + 发放学分值(数字)
  async function fillCredit(form, creditType, creditValue) {
    const item = itemByLabel(form, '学分');
    if (!item) return;
    const content = item.querySelector('.el-form-item__content');
    if (creditType) {
      const sel = content.querySelector('.el-select__wrapper');
      if (sel) {
        sel.click();
        await sleep(200);
        const targetNorm = normText(creditType);
        let opt = null;
        try {
          opt = await waitFor(() => {
            const poppers = document.querySelectorAll('.el-select__popper');
            for (const p of poppers) {
              if (p.getAttribute('aria-hidden') === 'true') continue;
              if (getComputedStyle(p).display === 'none') continue;
              const items = p.querySelectorAll('.el-select-dropdown__item');
              for (const it of items) {
                if (normText(it.textContent) === targetNorm) return it;
              }
            }
            return null;
          }, 5000);
        } catch (e) { /* ignore */ }
        if (opt) { opt.click(); await sleep(250); }
        else { throw new Error('学分类型下拉未找到：' + creditType); }
      }
    }
    if (creditValue !== '' && creditValue != null) {
      const num = content.querySelector('input[type="number"]');
      if (num) { setNativeValue(num, String(creditValue)); num.blur && num.blur(); }
    }
  }

  // 日期归一化为 yyyy-MM-dd（兼容：Date 对象、Excel 序列号、2026/11/2、2026-11-2、2026年11月2日 等）
  function normalizeDate(s) {
    if (s == null || s === '') return '';
    // Date 对象
    if (s instanceof Date && !isNaN(s)) {
      return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    }
    // Excel 日期序列号（纯数字且大于 20000）
    if (typeof s === 'number' || /^\d{4,6}$/.test(String(s).trim())) {
      const n = Number(s);
      if (!isNaN(n) && n > 20000 && n < 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      }
    }
    let str = String(s).trim();
    // 2026年11月2日
    let m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // 2026/11/2 或 2026-11-2 或 2026.11.2（忽略后面的时间部分）
    m = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    // 11/2/26 或 11/2/2026（月/日/年，美式短日期格式；两位年份默认 20xx）
    m = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
    if (m) {
      let y = m[3];
      if (y.length === 2) y = (Number(y) < 50 ? '20' : '19') + y;
      return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
    return str;
  }

  /* ========================= Excel 解析 ========================= */
  const COL_MAP = ['学号', '姓名', '开始时间', '结束时间', '内容', '活动一级分类', '活动二级分类', '活动等级', '奖项内容', '学分类型', '发放学分值'];

  function parseWorkbook(wb) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }); // raw:true 保留 Date 对象
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i] || []).some(c => normText(c) === '学号')) { headerIdx = i; break; }
    }
    if (headerIdx < 0) throw new Error('未找到表头（需包含“学号”列）');
    const header = (rows[headerIdx] || []).map(c => String(c || '').trim());
    const idx = {};
    COL_MAP.forEach(k => { idx[k] = header.findIndex(h => normText(h) === normText(k)); });
    const data = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      const get = (k) => {
        if (idx[k] < 0) return '';
        const v = r[idx[k]];
        if (v == null) return '';
        if (v instanceof Date) return v; // 日期保留 Date 对象，交给 normalizeDate
        return String(v).trim();
      };
      const sid = get('学号');
      if (!sid) continue;
      if (!/^\d+$/.test(sid)) continue; // 跳过说明行
      data.push({
        _row: i + 1, // Excel 行号（1 起），方便核对
        sid, name: get('姓名'),
        start: get('开始时间'), end: get('结束时间'),
        level: get('活动等级'), cat1: get('活动一级分类'), cat2: get('活动二级分类'),
        content: get('内容'), awards: get('奖项内容'),
        creditType: get('学分类型'), creditValue: get('发放学分值'),
        checked: true, status: '待处理'
      });
    }
    return data;
  }

  /* ========================= 状态与 UI ========================= */
  const state = { rows: [], cursor: 0, running: false };

  function log(msg) {
    if (!ui.log) return;
    ui.log.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  const ui = {};
  function buildPanel() {
    const box = document.createElement('div');
    box.id = 'dm-bulu-panel';
    box.style.cssText = 'position:fixed;top:16px;right:16px;width:340px;max-height:90vh;overflow:auto;'
      + 'background:#1f2937;color:#e5e7eb;border-radius:10px;padding:12px;font-size:12px;'
      + 'z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.35);font-family:system-ui,Microsoft YaHei,sans-serif;';
    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b style="font-size:13px;">批量补录助手</b>
        <span id="dm-close" style="cursor:pointer;color:#9ca3af;">✕</span>
      </div>
      <div style="margin-bottom:8px;">
        <button id="dm-file-btn" class="dm-btn">选择 Excel 文件</button>
        <input id="dm-file" type="file" accept=".xlsx,.xls" style="display:none">
        <span id="dm-file-name" style="margin-left:6px;color:#9ca3af;"></span>
      </div>
      <div id="dm-info" style="margin-bottom:6px;color:#9ca3af;">未加载数据</div>
      <div style="margin-bottom:6px;">
        <button id="dm-start" class="dm-btn dm-primary">开始 / 继续</button>
        <button id="dm-pause" class="dm-btn">暂停</button>
        <button id="dm-skip" class="dm-btn">跳过当前</button>
        <button id="dm-reset" class="dm-btn">重置进度</button>
      </div>
      <div id="dm-list" style="max-height:260px;overflow:auto;border:1px solid #374151;border-radius:6px;padding:4px;margin-bottom:6px;"></div>
      <div>日志：</div>
      <textarea id="dm-log" readonly style="width:100%;height:90px;background:#111827;color:#d1d5db;border:1px solid #374151;border-radius:6px;padding:4px;font-size:11px;resize:none;"></textarea>
    `;
    document.body.appendChild(box);
    window.__DM_BULU_PANEL__ = box;

    // 注入一点按钮样式
    const style = document.createElement('style');
    style.textContent = `.dm-btn{background:#374151;color:#e5e7eb;border:none;border-radius:6px;padding:4px 10px;margin-right:4px;cursor:pointer;font-size:12px;}
      .dm-btn:hover{background:#4b5563;} .dm-primary{background:#2563eb;} .dm-primary:hover{background:#3b82f6;}
      .dm-row{display:flex;align-items:center;gap:6px;padding:3px;border-bottom:1px solid #374151;cursor:pointer;}
      .dm-row.cur{background:#1e3a8a;} .dm-status-已确认{color:#34d399;} .dm-status-已取消{color:#fbbf24;} .dm-status-出错{color:#f87171;} .dm-status-待确认{color:#60a5fa;}`;
    document.head.appendChild(style);

    ui.box = box; ui.info = box.querySelector('#dm-info'); ui.list = box.querySelector('#dm-list'); ui.log = box.querySelector('#dm-log');
    box.querySelector('#dm-close').onclick = () => { box.remove(); window.__DM_BULU_PANEL__ = null; };
    box.querySelector('#dm-file-btn').onclick = () => box.querySelector('#dm-file').click();
    box.querySelector('#dm-file').onchange = onFile;
    box.querySelector('#dm-start').onclick = () => { if (!state.rows.length) { log('请先选择 Excel 文件'); return; } run(); };
    box.querySelector('#dm-pause').onclick = () => { state.running = false; log('已暂停'); updateUI(); };
    box.querySelector('#dm-skip').onclick = () => { if (state.cursor < state.rows.length) { state.rows[state.cursor].status = '已跳过'; state.cursor++; updateUI(); } };
    box.querySelector('#dm-reset').onclick = () => { state.rows.forEach(r => { r.status = '待处理'; r.checked = true; }); state.cursor = 0; updateUI(); };
  }

  function updateUI() {
    if (!ui.info) return;
    const total = state.rows.length;
    const done = state.rows.filter(r => r.status === '已确认').length;
    ui.info.textContent = `共 ${total} 条，已确认 ${done} 条，当前第 ${Math.min(state.cursor + 1, total)} / ${total} 条`;
    // 列表
    ui.list.innerHTML = '';
    state.rows.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'dm-row' + (i === state.cursor ? ' cur' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = r.checked;
      cb.onclick = (e) => { e.stopPropagation(); r.checked = cb.checked; };
      const txt = document.createElement('span');
      txt.style.flex = '1';
      txt.textContent = `${r._row}行 ${r.sid} ${r.name} · ${r.content || r.cat1 || ''}`;
      const st = document.createElement('span');
      st.className = 'dm-status-' + r.status;
      st.textContent = r.status;
      div.appendChild(cb); div.appendChild(txt); div.appendChild(st);
      div.onclick = () => { state.cursor = i; updateUI(); };
      ui.list.appendChild(div);
    });
    // 滚动到当前
    const cur = ui.list.querySelector('.dm-row.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    document.getElementById('dm-file-name').textContent = file.name;
    try {
      await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true }); // 日期单元格读成 Date 对象
      const rows = parseWorkbook(wb);
      state.rows = rows; state.cursor = 0; state.running = false;
      log(`已解析 ${rows.length} 条数据。请取消勾选示范行后点“开始”。`);
      updateUI();
    } catch (err) {
      log('解析失败：' + err.message);
    }
  }

  /* ========================= 主流程 ========================= */
  function clickButtonByText(text) {
    const t = normText(text);
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (normText(b.textContent) === t) return b;
    }
    return null;
  }

  async function openDialog() {
    // 若弹窗已开，先不关，直接用（一般是关着的）
    if (getDialogForm()) return;
    const btn = clickButtonByText('成长记录补录');
    if (!btn) throw new Error('未找到“成长记录补录”按钮');
    btn.click();
    await waitFor(() => getDialogForm(), 5000);
    await sleep(350);
  }

  // 等待用户点“确认”或关闭弹窗；返回 true=确认，false=取消/关闭
  function waitConfirmOrClose() {
    return new Promise((resolve) => {
      let confirmed = false;
      const dialog = getDialogRoot();
      const footer = dialog ? dialog.querySelector('.el-dialog__footer') : document;
      const okBtn = Array.from(footer.querySelectorAll('button')).find(b => normText(b.textContent).includes('确认'));
      const onConfirm = () => { confirmed = true; };
      if (okBtn) okBtn.addEventListener('click', onConfirm, { once: true });
      const start = Date.now();
      const iv = setInterval(() => {
        const form = getDialogForm();
        const gone = !form || (dialog && getComputedStyle(dialog.closest('.el-overlay')).display === 'none');
        if (gone) {
          clearInterval(iv);
          if (okBtn) okBtn.removeEventListener('click', onConfirm);
          resolve(confirmed);
        } else if (Date.now() - start > 600000) {
          clearInterval(iv); resolve(false);
        }
      }, 300);
    });
  }

  async function fillForm(row) {
    const form = getDialogForm();
    if (!form) throw new Error('未找到补录弹窗表单');
    await fillTextByLabel(form, '发放用户学号', row.sid);
    await fillDates(form, row.start, row.end);
    await selectByLabel(form, '活动级别', row.level);
    await selectByLabel(form, '活动一级分类', row.cat1);
    await sleep(500); // 等二级分类联动加载
    await selectByLabel(form, '活动二级分类', row.cat2);
    await fillTextByLabel(form, '记录内容', row.content);
    await fillAwards(form, row.awards);
    await fillCredit(form, row.creditType, row.creditValue);
  }

  async function run() {
    if (state.running) return;
    state.running = true;
    updateUI();
    log('开始处理...');
    while (state.running) {
      if (state.cursor >= state.rows.length) { log('全部处理完成'); break; }
      const row = state.rows[state.cursor];
      if (!row.checked) { state.cursor++; updateUI(); continue; }
      row.status = '填表中'; updateUI();
      try {
        await openDialog();
        await fillForm(row);
        row.status = '待确认'; updateUI();
        log(`请核对：${row.sid} ${row.name}（第 ${state.cursor + 1} 条），无误请点“确认”`);
        const ok = await waitConfirmOrClose();
        if (ok) {
          row.status = '已确认';
          state.cursor++;
          await sleep(500);
        } else {
          row.status = '已取消';
          state.running = false;
          log('检测到弹窗关闭但未点确认，已暂停。可点“跳过当前”或选其它行后继续。');
        }
      } catch (e) {
        row.status = '出错: ' + e.message;
        state.running = false;
        log('出错：' + e.message);
      }
      updateUI();
    }
    state.running = false;
    updateUI();
  }

  /* ========================= 启动 ========================= */
  function boot() {
    if (document.body) buildPanel();
    else setTimeout(boot, 300);
  }
  boot();
})();
