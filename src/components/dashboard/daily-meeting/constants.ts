import { CategoryFilterKey } from './types';

export const DEFAULT_CATEGORY_FILTER: Record<CategoryFilterKey, boolean> = {
    doing: true,
    blockedByOthers: true,
    blockingOthers: true,
    notStarted: true,
    other: true,
};

export const ACTIVE_STATUSES = new Set([
    'In Process',
    'Bug Fixing',
    'Testing',
    'Reviewing',
]);
