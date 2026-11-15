const fs = require('fs');
const path = require('path');

function testAST(file) {
  const content = fs.readFileSync(file, 'utf8');
  // Simple check: find all return statements in function scope, then find any hook after them
  const lines = content.split('\n');
  let functionDepth = 0;
  let componentStartLine = -1;
  let compName = '';
  let returned = false;
  let returnLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const compMatch = line.match(/(?:export\s+(?:default\s+)?)?(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*(?::\s*React\.FC[^=]*)?=\s*(?:\([^)]*\)|async\s*\([^)]*\))?\s*=>)/);
    if (compMatch) {
      const name = compMatch[1] || compMatch[2];
      if (/^[A-Z]/.test(name)) {
        compName = name;
        componentStartLine = i + 1;
        returned = false;
      }
    }

    if (compName) {
      // If we see early return at indentation level of the component
      if (/^\s{2,6}if\s*\(.*\)\s*return\b/.test(line) || /^\s{2,6}if\s*\(.*\{\s*return\b/.test(line) || /^\s{4}return\b/.test(line)) {
        if (!returned) {
          returned = true;
          returnLine = i + 1;
        }
      }

      const hookMatch = line.match(/\b(use[A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (hookMatch && returned) {
        console.log(`[AST VIOLATION FOUND] ${file}:${i + 1} in ${compName}: ${hookMatch[1]} called after return at line ${returnLine}`);
      }
    }
  }
}

function walk(dir) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules') walk(full);
    else if (item.isFile() && item.name.endsWith('.tsx')) testAST(full);
  }
}

walk('C:/Users/HP/OneDrive/Desktop/admi panel for antigravity/Admin-Dashbord/src');
console.log('Finished AST walk.');

