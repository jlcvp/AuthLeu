#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exit } = require('process');

const directoryPath = path.join(__dirname, '../../src/assets/i18n');
const baseFileName = 'en.json';
const baseFilePath = path.join(directoryPath, baseFileName);

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareKeys(baseKeys, targetKeys, prefix = '') {
    let success = true;
    for (const key of baseKeys) {
        if (!targetKeys.includes(key)) {
            console.error(`Missing key in target file: ${prefix}${key}`);
            success = false
        }
    }
    return success
}

function getAllKeys(obj, prefix = '') {
    return Object.keys(obj).reduce((keys, key) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            keys.push(...getAllKeys(obj[key], fullKey));
        } else {
            keys.push(fullKey);
        }
        return keys;
    }, []);
}

const baseFile = loadJson(baseFilePath);
const baseKeys = getAllKeys(baseFile);

fs.readdir(directoryPath, (err, files) => {
    if (err) {
        console.log('Unable to scan directory: ' + err);
        exit(1);
    }

    files.forEach(file => {
        if (file !== baseFileName && file.endsWith('.json')) {
            const targetFilePath = path.join(directoryPath, file);
            const targetFile = loadJson(targetFilePath);
            const targetKeys = getAllKeys(targetFile);

            process.stdout.write(`Comparing translation keys in ${baseFileName} with ${file}...`);
            const success = compareKeys(baseKeys, targetKeys);
            if (!success) {
                exit(1);
            }
            console.log(' OK');
        }
    });
    exit(0);
});