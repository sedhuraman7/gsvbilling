const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The massive Tailwind class replacements to achieve "Glassmorphism Dark Mode"
const replacements = [
    { from: /bg-slate-50/g, to: 'bg-transparent text-white' },
    { from: /bg-white/g, to: 'glass-panel text-white' },
    { from: /bg-slate-100/g, to: 'glass-panel-inner' },
    { from: /bg-slate-900/g, to: 'glass-panel text-white' },
    { from: /bg-slate-200/g, to: 'glass-panel-inner text-white' },
    { from: /text-slate-900/g, to: 'text-white' },
    { from: /text-slate-800/g, to: 'text-white' },
    { from: /text-slate-700/g, to: 'text-blue-100' },
    { from: /text-slate-600/g, to: 'text-blue-200' },
    { from: /text-slate-500/g, to: 'text-blue-300' },
    { from: /text-slate-400/g, to: 'text-blue-300' },
    { from: /text-black/g, to: 'text-white' },
    { from: /border-slate-100/g, to: 'border-white/10' },
    { from: /border-slate-200/g, to: 'border-white/10' },
    { from: /shadow-sm/g, to: 'shadow-lg shadow-black/20' },
    { from: /shadow-xl shadow-blue-900\/5/g, to: 'glass-panel' }
];

replacements.forEach(r => {
    content = content.replace(r.from, r.to);
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('UI Refactored successfully!');
