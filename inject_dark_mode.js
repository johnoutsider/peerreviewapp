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

const replacements = {
    'bg-slate-50': 'bg-slate-50 dark:bg-slate-900',
    'bg-white': 'bg-white dark:bg-slate-800',
    'bg-slate-100': 'bg-slate-100 dark:bg-slate-900/50',
    'text-slate-900': 'text-slate-900 dark:text-white',
    'text-slate-500': 'text-slate-500 dark:text-gray-400',
    'text-slate-600': 'text-slate-600 dark:text-gray-300',
    'text-slate-700': 'text-slate-700 dark:text-gray-200',
    'border-slate-200': 'border-slate-200 dark:border-white/10',
    'border-slate-300': 'border-slate-300 dark:border-white/20',
};

function processDir(dir) {
    walkDir(dir, function (filePath) {
        if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;

        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let original = content;

            let parts = content.split('className=');
            for (let i = 1; i < parts.length; i++) {
                let part = parts[i];
                let endQuote = part.startsWith('"') ? '"' : (part.startsWith('{`') ? '`}' : null);
                if (endQuote) {
                    let endIdx = part.indexOf(endQuote, 2);
                    if (endIdx !== -1) {
                        let classStr = part.substring(0, endIdx);

                        for (const [light, darkStr] of Object.entries(replacements)) {
                            // Simple string replace ensuring we don't duplicate
                            let regex = new RegExp(`\\b${light}\\b(?!\\s+dark:)`, 'g');
                            if (regex.test(classStr)) {
                                classStr = classStr.replace(regex, darkStr);
                            }
                        }

                        parts[i] = classStr + part.substring(endIdx);
                    }
                }
            }
            content = parts.join('className=');

            // Clean up possible duplications
            content = content.replace(/dark:dark:/g, 'dark:');

            if (content !== original) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log('Appended dark mode to: ' + filePath);
            }
        } catch (e) {
            console.error('Error processing ' + filePath, e);
        }
    });
}

processDir('./app');
processDir('./components');
console.log('Done appending dark mode styling!');
