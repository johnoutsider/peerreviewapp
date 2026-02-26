const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processDir(dir) {
    walkDir(dir, function (filePath) {
        if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;

        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let original = content;

            // Backgrounds
            content = content.replace(/bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900/g, 'bg-slate-50');
            content = content.replace(/bg-slate-900\/80/g, 'bg-blue-600');
            content = content.replace(/bg-slate-900\/95/g, 'bg-blue-600');
            content = content.replace(/bg-slate-900\/50/g, 'bg-slate-100');
            content = content.replace(/bg-slate-900/g, 'bg-slate-50');
            content = content.replace(/bg-slate-800\/50/g, 'bg-white');
            content = content.replace(/bg-slate-800\/30/g, 'bg-slate-50');
            content = content.replace(/bg-slate-800\/60/g, 'bg-white');
            content = content.replace(/bg-slate-800/g, 'bg-white shadow-sm border border-slate-200');
            content = content.replace(/bg-slate-700\/50/g, 'bg-white border border-slate-200');
            content = content.replace(/bg-slate-700/g, 'bg-slate-100');
            content = content.replace(/from-slate-900/g, 'from-slate-50');

            // Borders
            content = content.replace(/border-white\/10/g, 'border-slate-200 shadow-sm');
            content = content.replace(/border-white\/20/g, 'border-slate-300');
            content = content.replace(/border-white\/5/g, 'border-slate-200');

            // Text colors
            content = content.replace(/text-gray-400/g, 'text-slate-500');
            content = content.replace(/text-gray-300/g, 'text-slate-600');
            content = content.replace(/text-gray-200/g, 'text-slate-700');

            if (!filePath.includes('Header.tsx')) {
                // Safely replace text-white only if there's no solid background class nearby.
                // A simpler string replacement logic that splits by `className=`
                let parts = content.split('className=');
                for (let i = 1; i < parts.length; i++) {
                    let part = parts[i];
                    let endQuote = part.startsWith('"') ? '"' : (part.startsWith('{`') ? '`}' : null);
                    if (endQuote) {
                        let endIdx = part.indexOf(endQuote, 2);
                        if (endIdx !== -1) {
                            let classStr = part.substring(0, endIdx);
                            let hasSolidBg = /(bg-blue-[567]00|bg-green-[567]00|bg-red-[567]00|bg-teal-[567]00|from-green-|from-blue-|bg-purple-[567]00)/.test(classStr);
                            if (!hasSolidBg && classStr.includes('text-white')) {
                                let newClassStr = classStr.replace(/\btext-white\b/g, 'text-slate-900');
                                parts[i] = newClassStr + part.substring(endIdx);
                            }
                        }
                    }
                }
                content = parts.join('className=');
            } else {
                // In Header
                content = content.replace(/bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500/g, 'text-white text-2xl drop-shadow-sm');
                content = content.replace(/text-blue-100 hover:text-white/g, 'text-blue-100 hover:text-white'); // Fix from previous run
                content = content.replace(/text-gray-300 hover:text-white/g, 'text-blue-100 hover:text-white');
                content = content.replace(/text-white font-bold border-b-2 border-white/g, 'text-white font-bold border-b-2 border-white');
                content = content.replace(/text-blue-400/g, 'text-white font-bold border-b-2 border-white');
                content = content.replace(/bg-white\/10/g, 'bg-blue-500');
                content = content.replace(/bg-slate-900\\\/95 backdrop-blur-xl border-b border-white\\\/10/g, 'bg-blue-600 border-b border-blue-500');
            }

            if (content !== original) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log('Updated: ' + filePath);
            }
        } catch (e) {
            console.error('Error processing ' + filePath, e);
        }
    });
}

processDir('./app');
processDir('./components');

console.log('Done!');
