/**
 * QQBot KaTeX Rich Text UI Builder Helpers
 * 
 * 适用于 QQ 官方 Bot、SealDice 插件、OneBot 等环境的纯矢量 KaTeX 富文本构建工具库。
 * 核心目标：自动包裹 \text{}、防止字符冲突、防止网格塌陷、自适应移动端宽度。
 */

/**
 * 安全转义中文字符与敏感符号，包裹在 \text{} 中
 * @param {string|number} content 原始字符串或数值
 * @returns {string} 安全的 \text{...} 结构
 */
function text(content) {
  if (content === null || content === undefined) return '\\text{}';
  const str = String(content)
    .replace(/\\/g, '')
    .replace(/[\{\}]/g, '')
    .replace(/[%]/g, '\\%')
    .replace(/[_]/g, '\\_');
  return `\\text{${str}}`;
}

/**
 * 纯代码双色/多色无图血条 / 能量条生成器
 * @param {number} current 当前值
 * @param {number} max 最大值
 * @param {Object} options 配置项
 * @param {number} [options.width=100] 总宽度(px)，建议 80~180
 * @param {number} [options.height=7] 条高度(px)
 * @param {string} [options.fg='#10B981'] 前景色(HEX)
 * @param {string} [options.bg='#374151'] 底色(HEX)
 * @returns {string} KaTeX 血条片段
 */
function bar(current, max, options = {}) {
  const width = options.width || 100;
  const height = options.height || 7;
  const fg = options.fg || '#10B981';
  const bg = options.bg || '#374151';

  const safeCur = Math.max(0, Math.min(max, current));
  const fgPx = Math.round((safeCur / (max || 1)) * width);
  const bgPx = Math.max(0, width - fgPx);

  return `\\textcolor{${fg}}{\\rule{${fgPx}px}{${height}px}}\\textcolor{${bg}}{\\rule{${bgPx}px}{${height}px}}`;
}

/**
 * 单层带边框徽章胶囊生成器
 * @param {string} label 徽章文字
 * @param {Object} options 颜色配置
 * @param {string} [options.border='#DC2626'] 边框颜色
 * @param {string} [options.bg='#FEE2E2'] 背景颜色
 * @param {string} [options.fg='#DC2626'] 文字颜色
 * @param {boolean} [options.bold=true] 是否加粗
 * @returns {string} \fcolorbox 结构
 */
function badge(label, options = {}) {
  const border = options.border || '#DC2626';
  const bg = options.bg || '#FEE2E2';
  const fg = options.fg || '#DC2626';
  const inner = options.bold !== false ? `\\textbf{${text(label)}}` : text(label);
  return `\\fcolorbox{${border}}{${bg}}{\\textcolor{${fg}}{${inner}}}`;
}

/**
 * 街机双重霓虹边框 (Double Neon Border)
 * @param {string} label 文本
 * @param {Object} options 边框色调配置
 */
function neonBadge(label, options = {}) {
  const outerBorder = options.outerBorder || '#9333EA';
  const outerBg = options.outerBg || '#3B0764';
  const innerBorder = options.innerBorder || '#A855F7';
  const innerBg = options.innerBg || '#581C87';
  const fg = options.fg || '#FFFFFF';
  return `\\fcolorbox{${outerBorder}}{${outerBg}}{\\fcolorbox{${innerBorder}}{${innerBg}}{\\textcolor{${fg}}{\\textbf{${text(label)}}}}}`;
}

/**
 * 划线改价 / 原价作废指向新价
 * @param {string|number} oldVal 原价
 * @param {string|number} newVal 新价
 * @param {string} [newColor='#DC2626'] 新价高亮色
 */
function cancelTo(oldVal, newVal, newColor = '#DC2626') {
  return `\\cancelto{\\textcolor{${newColor}}{\\textbf{${text(newVal)}}}}{${text(oldVal)}}`;
}

/**
 * 防塌陷安全网格 / 背包表格生成器
 * @param {Array<Array<string>>} rows 二维数组，单元格内容
 * @param {Object} options 表格配置
 * @param {string} [options.align='c'] 对齐方式 ('c' | 'l' | 'r')
 * @param {string} [options.placeholder='占位空格'] 空单元格填充文本
 */
function grid(rows, options = {}) {
  if (!rows || rows.length === 0) return '';
  const cols = Math.max(...rows.map(r => r.length));
  const alignPattern = '|' + Array(cols).fill(options.align || 'c').join('|') + '|';
  const placeholder = options.placeholder || '占位空格';

  const bodyLines = rows.map(row => {
    const padded = [];
    for (let i = 0; i < cols; i++) {
      const cell = row[i];
      if (!cell || String(cell).trim() === '') {
        padded.push(`\\phantom{${text(placeholder)}}`);
      } else {
        padded.push(String(cell));
      }
    }
    return padded.join(' & ') + ' \\\\ \\hline';
  }).join('\n');

  return `\\begin{array}{${alignPattern}}\n\\hline\n${bodyLines}\n\\end{array}`;
}

/**
 * 剧情与行动分支选择器 (cases)
 * @param {string} prefix 提示前缀文本
 * @param {Array<string>} choices 选项列表
 */
function branchCases(prefix, choices = []) {
  const branchLines = choices.map(c => text(c)).join(' \\\\ ');
  return `${text(prefix)}\\begin{cases} ${branchLines} \\end{cases}`;
}

/**
 * 离散能量点 / 星级槽生成器
 * @param {number} current 当前激活数
 * @param {number} max 总槽位数
 * @param {Object} options 配置
 */
function chargeSlot(current, max, options = {}) {
  const type = options.type || 'bullet'; // 'bullet' | 'square' | 'star'
  const activeColor = options.activeColor || '#0EA5E9';
  const inactiveColor = options.inactiveColor || '#9CA3AF';

  const cur = Math.max(0, Math.min(max, current));
  const left = max - cur;

  let activeSymbol = '\\bullet\\,';
  let inactiveSymbol = '\\circ\\,';

  if (type === 'square') {
    activeSymbol = '\\blacksquare';
    inactiveSymbol = '\\square';
  } else if (type === 'star') {
    activeSymbol = '\\bigstar';
    inactiveSymbol = '\\star';
  }

  const activeStr = Array(cur).fill(activeSymbol).join(type === 'bullet' ? '' : '');
  const inactiveStr = Array(left).fill(inactiveSymbol).join(type === 'bullet' ? '' : '');

  return `\\textcolor{${activeColor}}{${activeStr}}\\textcolor{${inactiveColor}}{${inactiveStr}}`;
}

/**
 * 战术 HUD 瞄准锁敌框
 * @param {string} targetName 锁定目标名称
 * @param {string} statusDesc 状态描述
 */
function aimingBox(targetName, statusDesc) {
  return `\\begin{matrix}
\\ulcorner & & \\urcorner \\\\
& \\textcolor{#EF4444}{\\odot\\ \\textbf{${text('LOCKED: ' + targetName)}}} & \\\\
& ${text(statusDesc)} & \\\\
\\llcorner & & \\lrcorner
\\end{matrix}`;
}

module.exports = {
  text,
  bar,
  badge,
  neonBadge,
  cancelTo,
  grid,
  branchCases,
  chargeSlot,
  aimingBox
};