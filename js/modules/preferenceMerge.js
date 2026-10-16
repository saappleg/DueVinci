const NURSING_WORKSPACE_PREFIX = 'duevinci_workspace_nursing_hub_';
export const MAX_NURSING_WORKSPACE_BYTES = 240000;
const MISSING = Symbol('missing');

function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isCanonicalText(value, maxLength, { required = false } = {}) {
    return typeof value === 'string' && value === value.trim() && value.length <= maxLength && (!required || value.length > 0);
}

function isCanonicalId(value, maxLength = 100) {
    return isCanonicalText(value, maxLength, { required: true });
}

function onlyKnownKeys(value, allowedKeys) {
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every((key) => allowed.has(key));
}

function hasUniqueRecordIds(records) {
    const ids = records.map((record) => record.id);
    return ids.every((id) => isCanonicalId(id)) && new Set(ids).size === ids.length;
}

function isValidSerializedNursingWorkspace(serialized) {
    if (typeof serialized !== 'string' || serialized.length > MAX_NURSING_WORKSPACE_BYTES) return false;
    try { return isValidNursingWorkspaceShape(JSON.parse(serialized)); } catch { return false; }
}

function isValidDate(value) {
    if (!isCanonicalText(value, 10)) return false;
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validOptionalTextFields(record, limits) {
    return Object.entries(limits).every(([key, maxLength]) => !hasOwn(record, key) || isCanonicalText(record[key], maxLength));
}

function validOptionalNumber(record, key, min, max) {
    return !hasOwn(record, key) || (typeof record[key] === 'number' && Number.isFinite(record[key]) && record[key] >= min && record[key] <= max);
}

export function isValidNursingWorkspaceShape(value) {
    if (!isPlainObject(value)) return false;
    const workspaceKeys = ['version', 'rotations', 'carePlans', 'customCards', 'cardMastery', 'dosageProgress', 'dosageIndex', 'completedSystems', 'syncConflicts', 'updatedAt'];
    if (!onlyKnownKeys(value, workspaceKeys)) return false;
    if (hasOwn(value, 'version') && value.version !== 1) return false;

    if (hasOwn(value, 'rotations')) {
        const validRotations = Array.isArray(value.rotations) && value.rotations.length <= 40 && value.rotations.every((record) => {
            if (!isPlainObject(record) || !onlyKnownKeys(record, ['id', 'name', 'courseId', 'courseLabel', 'startDate', 'endDate', 'skills']) ||
                !isCanonicalId(record.id) || !isCanonicalText(record.name, 120, { required: true }) ||
                !validOptionalTextFields(record, { courseId: 100, courseLabel: 120 }) ||
                (hasOwn(record, 'startDate') && !isValidDate(record.startDate)) || (hasOwn(record, 'endDate') && !isValidDate(record.endDate))) return false;
            if (!hasOwn(record, 'skills')) return true;
            return Array.isArray(record.skills) && record.skills.length <= 80 && record.skills.every((skill) => isPlainObject(skill) &&
                onlyKnownKeys(skill, ['id', 'name', 'status']) && isCanonicalId(skill.id) && isCanonicalText(skill.name, 120, { required: true }) &&
                (!hasOwn(skill, 'status') || ['planned', 'practiced', 'checked'].includes(skill.status))) &&
                hasUniqueRecordIds(record.skills);
        });
        if (!validRotations || !hasUniqueRecordIds(value.rotations)) return false;
    }

    if (hasOwn(value, 'carePlans')) {
        if (!Array.isArray(value.carePlans) || value.carePlans.length > 40 || !value.carePlans.every((record) => isPlainObject(record) &&
            onlyKnownKeys(record, ['id', 'title', 'bodySystem', 'scenario', 'cues', 'priority', 'outcome', 'actions', 'rationale', 'evaluation', 'createdAt']) &&
            isCanonicalId(record.id) && isCanonicalText(record.title, 120, { required: true }) &&
            validOptionalTextFields(record, { bodySystem: 80, scenario: 1800, cues: 1800, priority: 1000, outcome: 1000, actions: 1800, rationale: 1800, evaluation: 1400, createdAt: 40 }))) return false;
        if (!hasUniqueRecordIds(value.carePlans)) return false;
    }

    if (hasOwn(value, 'customCards')) {
        if (!Array.isArray(value.customCards) || value.customCards.length > 100 || !value.customCards.every((record) => isPlainObject(record) &&
            onlyKnownKeys(record, ['id', 'topic', 'front', 'back', 'source']) && isCanonicalId(record.id) &&
            isCanonicalText(record.front, 500, { required: true }) && isCanonicalText(record.back, 1200, { required: true }) &&
            validOptionalTextFields(record, { topic: 60, source: 1200 }))) return false;
        if (!hasUniqueRecordIds(value.customCards)) return false;
    }

    if (hasOwn(value, 'completedSystems') && (!Array.isArray(value.completedSystems) || value.completedSystems.length > 80 || !value.completedSystems.every((item) => isCanonicalId(item, 120)) || new Set(value.completedSystems).size !== value.completedSystems.length)) return false;

    if (hasOwn(value, 'cardMastery')) {
        if (!isPlainObject(value.cardMastery) || Object.keys(value.cardMastery).length > 150) return false;
        for (const [id, mastery] of Object.entries(value.cardMastery)) {
            if (!isCanonicalId(id, 120) || !isPlainObject(mastery) || !onlyKnownKeys(mastery, ['repetitions', 'interval', 'easinessFactor', 'nextReviewDate', 'lastReviewed']) ||
                !validOptionalNumber(mastery, 'repetitions', 0, 100000) || !validOptionalNumber(mastery, 'interval', 1, 36500) ||
                !validOptionalNumber(mastery, 'easinessFactor', 1.3, 5) ||
                (hasOwn(mastery, 'nextReviewDate') && !isValidDate(mastery.nextReviewDate)) || (hasOwn(mastery, 'lastReviewed') && !isValidDate(mastery.lastReviewed))) return false;
        }
    }

    if (hasOwn(value, 'dosageProgress')) {
        const problemIds = new Set(['tablets', 'oral-solution', 'pump-rate', 'drop-rate']);
        if (!isPlainObject(value.dosageProgress) || Object.keys(value.dosageProgress).length > problemIds.size) return false;
        for (const [id, progress] of Object.entries(value.dosageProgress)) {
            if (!problemIds.has(id) || !isPlainObject(progress) || !onlyKnownKeys(progress, ['attempts', 'correct', 'completed']) ||
                !validOptionalNumber(progress, 'attempts', 0, 100000) || !validOptionalNumber(progress, 'correct', 0, 100000) ||
                (hasOwn(progress, 'completed') && typeof progress.completed !== 'boolean')) return false;
        }
    }

    if (hasOwn(value, 'syncConflicts') && (!Array.isArray(value.syncConflicts) || value.syncConflicts.length > 80 || !value.syncConflicts.every((item) => isPlainObject(item) &&
        onlyKnownKeys(item, ['id', 'path', 'versionA', 'versionB']) && isCanonicalId(item.id) && Array.isArray(item.path) && item.path.length && item.path.length <= 12 &&
        item.path.every((part) => isCanonicalId(part, 120)) && isCanonicalText(item.versionA, 3000) && isCanonicalText(item.versionB, 3000) && item.versionA !== item.versionB) ||
        !hasUniqueRecordIds(value.syncConflicts))) return false;
    if (hasOwn(value, 'dosageIndex') && (!Number.isInteger(value.dosageIndex) || value.dosageIndex < 0 || value.dosageIndex > 3)) return false;
    if (hasOwn(value, 'updatedAt') && !isCanonicalText(value.updatedAt, 40)) return false;
    return true;
}

function sameValue(left, right) {
    if (Object.is(left, right)) return true;
    if (left === undefined || right === undefined) return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function isIdArray(value) {
    return Array.isArray(value) && value.every((item) => isPlainObject(item) && typeof item.id === 'string' && item.id) &&
        new Set(value.map((item) => item.id)).size === value.length;
}

function mergeStringSet(base, local, remote) {
    const baseSet = new Set(base);
    const localSet = new Set(local);
    const remoteSet = new Set(remote);
    const allValues = [...remote, ...local, ...base];
    return [...new Set(allValues)].filter((value) => {
        const wasPresent = baseSet.has(value);
        const localPresent = localSet.has(value);
        const remotePresent = remoteSet.has(value);
        return localPresent !== wasPresent ? localPresent : remotePresent;
    });
}

function conflictIdentifier(path, versionA, versionB) {
    const source = JSON.stringify([path, versionA, versionB]);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `conflict-${(hash >>> 0).toString(36)}`;
}

function addTextConflict(conflicts, path, local, remote) {
    if (path[0] === 'syncConflicts' || typeof local !== 'string' || typeof remote !== 'string') return;
    const versions = [local, remote].sort((left, right) => left.localeCompare(right));
    const [versionA, versionB] = versions;
    conflicts.push({ id: conflictIdentifier(path, versionA, versionB), path, versionA, versionB });
}

function mergeIdentifiedArray(base, local, remote, conflicts, path) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const localById = new Map(local.map((item) => [item.id, item]));
    const remoteById = new Map(remote.map((item) => [item.id, item]));
    const orderedIds = [...remote, ...local, ...base].map((item) => item.id);
    const uniqueIds = [...new Set(orderedIds)];
    const merged = [];

    uniqueIds.forEach((id) => {
        const item = mergeNode(
            baseById.get(id), baseById.has(id),
            localById.get(id), localById.has(id),
            remoteById.get(id), remoteById.has(id),
            conflicts, [...path, id],
        );
        if (item !== MISSING) merged.push(item);
    });
    return merged;
}

function mergeNode(base, hasBase, local, hasLocal, remote, hasRemote, conflicts = [], path = []) {
    if (hasBase && sameValue(local, base) && hasLocal === hasBase) return hasRemote ? remote : MISSING;
    if (hasBase && sameValue(remote, base) && hasRemote === hasBase) return hasLocal ? local : MISSING;
    if (hasLocal && hasRemote && sameValue(local, remote)) return local;

    if (!hasLocal && !hasRemote) return MISSING;
    if (!hasLocal) {
        if (!hasBase) return remote;
        // A remote edit wins over a concurrent local deletion to preserve work.
        return hasBase && !sameValue(remote, base) ? remote : MISSING;
    }
    if (!hasRemote) {
        if (!hasBase) return local;
        // A local edit survives a concurrent remote deletion to avoid losing it.
        return hasBase && !sameValue(local, base) ? local : MISSING;
    }

    if (isPlainObject(local) && isPlainObject(remote) && (!hasBase || isPlainObject(base))) {
        const result = {};
        const keys = new Set([
            ...(hasBase ? Object.keys(base) : []),
            ...Object.keys(local),
            ...Object.keys(remote),
        ]);
        keys.forEach((key) => {
            const value = mergeNode(
                base && base[key], Boolean(hasBase && hasOwn(base, key)),
                local[key], hasOwn(local, key),
                remote[key], hasOwn(remote, key),
                conflicts, [...path, key],
            );
            if (value !== MISSING) result[key] = value;
        });
        return result;
    }

    if (Array.isArray(local) && Array.isArray(remote) && (!hasBase || Array.isArray(base))) {
        const previous = hasBase ? base : [];
        if ([...previous, ...local, ...remote].every((item) => typeof item === 'string')) {
            return mergeStringSet(previous, local, remote);
        }
        if (isIdArray(previous) && isIdArray(local) && isIdArray(remote)) {
            return mergeIdentifiedArray(previous, local, remote, conflicts, path);
        }
    }

    // Keep the existing local value active, but preserve both text versions
    // in the workspace so a student can review and choose after reconnecting.
    if (hasLocal && hasRemote && !sameValue(local, remote)) addTextConflict(conflicts, path, local, remote);
    return local;
}

function mergeWorkspaceValue(previousValue, localValue, remoteValue) {
    try {
        const previous = previousValue === undefined ? undefined : JSON.parse(previousValue);
        const local = JSON.parse(localValue);
        const remote = JSON.parse(remoteValue);
        if (!isValidSerializedNursingWorkspace(localValue) || !isValidSerializedNursingWorkspace(remoteValue) ||
            (previousValue !== undefined && !isValidSerializedNursingWorkspace(previousValue))) {
            throw new TypeError('Nursing Hub workspace has an invalid data shape.');
        }
        const conflicts = [];
        const merged = mergeNode(previous, previousValue !== undefined, local, true, remote, true, conflicts, []);
        if (conflicts.length && isPlainObject(merged)) {
            const existing = Array.isArray(merged.syncConflicts) ? merged.syncConflicts : [];
            const byId = new Map(existing.filter((item) => isPlainObject(item) && typeof item.id === 'string').map((item) => [item.id, item]));
            conflicts.forEach((conflict) => byId.set(conflict.id, conflict));
            merged.syncConflicts = [...byId.values()];
        }
        const serialized = JSON.stringify(merged === MISSING ? {} : merged);
        if (!isValidSerializedNursingWorkspace(serialized)) {
            throw new TypeError('Merged Nursing Hub workspace exceeds its supported limits.');
        }
        return serialized;
    } catch (error) {
        // Fail closed: a malformed local or remote draft must not be used to
        // overwrite the other copy. The sync caller will retry after repair.
        throw new Error('Nursing Hub drafts could not be parsed; sync paused to protect the saved copy.', { cause: error });
    }
}

export function changedPreferenceKeys(before = {}, after = {}) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return new Set([...keys].filter((key) => before[key] !== after[key] || hasOwn(before, key) !== hasOwn(after, key)));
}

export function mergePreferenceChanges(remote = {}, local = {}, changedKeys = new Set(), previous = {}) {
    const merged = { ...remote };
    changedKeys.forEach((key) => {
        const isNursingWorkspace = key.startsWith(NURSING_WORKSPACE_PREFIX);
        const localHasKey = hasOwn(local, key);
        const remoteHasKey = hasOwn(remote, key);
        const previousHasKey = hasOwn(previous, key);

        if (isNursingWorkspace && localHasKey && remoteHasKey) {
            merged[key] = mergeWorkspaceValue(
                previousHasKey ? previous[key] : undefined,
                local[key],
                remote[key],
            );
        } else if (isNursingWorkspace && !localHasKey && remoteHasKey && previousHasKey && remote[key] !== previous[key]) {
            // Preserve a concurrent Nursing Hub edit instead of deleting it.
        } else if (localHasKey) {
            merged[key] = local[key];
        } else {
            delete merged[key];
        }
    });
    // A missing cloud row may reflect a stale device or partial backup. Keep
    // this account's local Nursing workspace unless the user deliberately
    // clears it through the Nursing Hub, which saves an empty workspace.
    Object.entries(local).forEach(([key, value]) => {
        if (key.startsWith(NURSING_WORKSPACE_PREFIX) && !hasOwn(remote, key) && !hasOwn(merged, key)) {
            merged[key] = value;
        }
    });
    Object.entries(merged).forEach(([key, value]) => {
        if (key.startsWith(NURSING_WORKSPACE_PREFIX) && !isValidSerializedNursingWorkspace(value)) {
            throw new Error('Nursing Hub drafts could not be parsed; sync paused to protect the saved copy.');
        }
    });
    return merged;
}
