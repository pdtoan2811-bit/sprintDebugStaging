'use client';

/**
 * Migrates old localStorage data to the new file-based API system.
 * It checks if there is any data in localStorage that hasn't been migrated yet,
 * and if so, it sends it to the API and then optionally clears or marks it as migrated.
 */
export async function migrateLocalStorageToAPI() {
    if (typeof window === 'undefined') return;

    // Check if we already migrated
    const hasMigrated = localStorage.getItem('sprint_relay_migrated_to_api');
    if (hasMigrated === 'true') return;

    const migrationData: Record<string, any> = {};
    let foundData = false;

    // Grab all target keys
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
        // Nothing to migrate, just mark it done
        localStorage.setItem('sprint_relay_migrated_to_api', 'true');
        return;
    }

    try {
        console.log('Migrating old localStorage data to API...');

        // Fetch current DB data first to not overwrite anything newer
        const currentRes = await fetch('/api/data');
        const currentDb = await currentRes.json();

        const mergedData: Record<string, any> = {};

        // For each key, we parse the localStorage string, parse the DB string, 
        // merge them, and stringify them back.
        for (const key of targetKeys) {
            if (migrationData[key]) {
                try {
                    // It's either an object/array (JSON) or a plain string
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
                } catch (e) {
                    mergedData[key] = currentDb[key] || migrationData[key];
                }
            }
        }

        // Post the merged payload
        const postRes = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mergedData)
        });

        if (postRes.ok) {
            console.log('Migration complete!');
            localStorage.setItem('sprint_relay_migrated_to_api', 'true');
            return true;
        }
    } catch (error) {
        console.error('Failed to migrate local storage to API:', error);
    }
    return false;
}
