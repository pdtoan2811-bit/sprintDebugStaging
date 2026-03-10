'use client';

/**
 * Migrates old localStorage data to the new file-based API system.
 * This runs in the background and doesn't block page load.
 */
export function migrateLocalStorageToAPI() {
    if (typeof window === 'undefined') return;

    const hasMigrated = localStorage.getItem('sprint_relay_migrated_to_api');
    if (hasMigrated === 'true') return;

    const migrationData: Record<string, string> = {};
    let foundData = false;

    const targetKeys = [
        'sprint_relay_notes',
        'sprint_relay_meeting_notes',
        'sprint_relay_high_risk',
        'sprint_relay_sprint_config',
        'sprint_relay_manual_sprint',
        'sprint_relay_interrogation_logs'
    ];

    for (const key of targetKeys) {
        const val = localStorage.getItem(key);
        if (val) {
            migrationData[key] = val;
            foundData = true;
        }
    }

    if (!foundData) {
        localStorage.setItem('sprint_relay_migrated_to_api', 'true');
        return;
    }

    fetch('/api/data')
        .then(res => res.json())
        .then(currentDb => {
            const mergedData: Record<string, string> = {};

            for (const key of targetKeys) {
                if (migrationData[key]) {
                    try {
                        const localObj = JSON.parse(migrationData[key]);
                        const dbObj = currentDb[key] ? JSON.parse(currentDb[key]) : null;

                        if (Array.isArray(localObj)) {
                            if (dbObj && Array.isArray(dbObj)) {
                                if (key === 'sprint_relay_high_risk') {
                                    mergedData[key] = JSON.stringify(Array.from(new Set([...localObj, ...dbObj])));
                                } else {
                                    mergedData[key] = JSON.stringify(dbObj.length > localObj.length ? dbObj : localObj);
                                }
                            } else {
                                mergedData[key] = JSON.stringify(localObj);
                            }
                        } else if (typeof localObj === 'object' && localObj !== null) {
                            const mergedRecord = { ...localObj, ...(dbObj || {}) };
                            mergedData[key] = JSON.stringify(mergedRecord);
                        } else {
                            mergedData[key] = currentDb[key] || migrationData[key];
                        }
                    } catch {
                        mergedData[key] = currentDb[key] || migrationData[key];
                    }
                }
            }

            return fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mergedData)
            });
        })
        .then(res => {
            if (res?.ok) {
                localStorage.setItem('sprint_relay_migrated_to_api', 'true');
            }
        })
        .catch(err => console.error('Migration failed:', err));
}
