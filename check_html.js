const fs = require('fs');
const vm = require('vm');
const js = fs.readFileSync('dist/extension.js', 'utf8');

// 找到反引号包裹的 HTML 模板起始
const htmlTemplateStart = js.indexOf('`<!DOCTYPE html>');
if (htmlTemplateStart < 0) { console.log('not found'); process.exit(1); }

// 提取模板字符串内容（不含反引号）
let i = htmlTemplateStart + 1;
let endIdx = -1, depth = 0;
while (i < js.length) {
  const c = js.charCodeAt(i);
  if (c === 96 && depth === 0) { endIdx = i; break; }
  else if (c === 36 && js.charCodeAt(i+1) === 123) { depth++; i += 2; continue; }
  else if (c === 125 && depth > 0) depth--;
  i++;
}

// 把 \uXXXX 替换为实际 Unicode 字符（模拟 JS 运行时求值）
const rawHtml = js.substring(htmlTemplateStart + 1, endIdx);
const html = rawHtml.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
const htmlLines = html.split('\n');
console.log('Total HTML lines:', htmlLines.length);

// 找 <script> 边界并提取脚本
const scriptTagIdx = html.indexOf('<script>');
const scriptEndIdx = html.indexOf('</script>', scriptTagIdx);
const scriptStartLine = html.substring(0, scriptTagIdx).split('\n').length;
const scriptContent = html.substring(scriptTagIdx + 8, scriptEndIdx);
const scriptLines = scriptContent.split('\n');
console.log('<script> starts at HTML line:', scriptStartLine, ', script has', scriptLines.length, 'lines');

// 用 vm.Script 做语法检查（比 new Function 更准确，含行号信息）
try {
  new vm.Script(scriptContent, { filename: 'inline-script.js' });
  console.log('✅ JS syntax OK');
} catch(e) {
  console.log('❌ JS SyntaxError:', e.message);
  console.log('Stack:', e.stack.split('\n').slice(0, 5).join('\n'));
  // 从 stack 里提取行号
  const lineMatch = e.stack.match(/inline-script\.js:(\d+)/);
  if (lineMatch) {
    const errLine = parseInt(lineMatch[1]);
    console.log('\nError at script-line:', errLine, '-> HTML line:', scriptStartLine + errLine - 1);
    for (let r = Math.max(0, errLine - 3); r <= Math.min(scriptLines.length - 1, errLine + 2); r++) {
      console.log((r+1 === errLine ? '>>> ' : '    ') + (r+1) + ': ' + scriptLines[r]);
    }
  }
}

// 打印 HTML 第 1083-1092 行（实际 Unicode 字符）
console.log('\n--- HTML lines 1083-1092 (actual unicode) ---');
for (let r = 1082; r <= 1091; r++) {
  const line = htmlLines[r] || '(empty)';
  console.log('L' + (r+1) + '[' + line.length + ']: ' + line.substring(0, 100));
}
