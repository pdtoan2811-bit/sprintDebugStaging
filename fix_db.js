const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const data = JSON.parse(raw);
    console.log('Current keys:', Object.keys(data));
    
    // Ensure essential keys exist
    if (!data.sprint_relay_sprint_config) {
        console.log('Adding default sprint config...');
        data.sprint_relay_sprint_config = JSON.stringify([
            { number: '7', startDate: '2026-01-05', endDate: '2026-01-16' },
            { number: '8', startDate: '2026-01-19', endDate: '2026-01-30' },
            { number: '9', startDate: '2026-02-02', endDate: '2026-02-13' },
            { number: '10', startDate: '2026-02-16', endDate: '2026-02-27' },
            { number: '11', startDate: '2026-03-02', endDate: '2026-03-13' },
            { number: '12', startDate: '2026-03-16', endDate: '2026-03-27' },
        ]);
    }
    
    if (!data.sprint_relay_manual_sprint) {
        data.sprint_relay_manual_sprint = "auto";
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('Successfully fixed db.json');
} catch (e) {
    console.error('Failed to fix db.json:', e);
}
