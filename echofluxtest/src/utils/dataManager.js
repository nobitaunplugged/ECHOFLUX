const path = require('path');
const fs = require('fs-extra');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function dataPath(filename) {
    fs.ensureDirSync(DATA_DIR);
    return path.join(DATA_DIR, filename);
}

function loadJson(filename, defaultValue = {}) {
    const filepath = dataPath(filename);
    if (!fs.existsSync(filepath)) {
        return defaultValue;
    }
    try {
        return fs.readJsonSync(filepath);
    } catch (error) {
        return defaultValue;
    }
}

function saveJson(filename, data) {
    const filepath = dataPath(filename);
    fs.ensureDirSync(DATA_DIR);
    fs.writeJsonSync(filepath, data, { spaces: 4 });
}

module.exports = {
    loadJson,
    saveJson
};
