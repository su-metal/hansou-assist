// scripts/simulate.js
const facility = {
    turnover_rules: [
        { funeral_time: '09:00', min_wake_time: '18:00' },
        { funeral_time: '10:00', min_wake_time: '18:00' },
        { funeral_time: '11:00', min_wake_time: '18:00' },
        { funeral_time: '12:00', is_forbidden: true }
    ],
    funeral_block_time: '13:00',
    turnover_interval_hours: 8
};

const funeralTimeStr = '10:00';

const timeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const getTurnoverConstraint = (facility, funeralTimeStr) => {
    if (!funeralTimeStr) return { minWakeMin: null, isForbidden: false };

    const fMin = timeToMinutes(funeralTimeStr);
    if (fMin === null) return { minWakeMin: null, isForbidden: false };

    const rules = Array.isArray(facility.turnover_rules) ? facility.turnover_rules : [];
    const sortedRules = [...rules].sort((a, b) => (timeToMinutes(a.funeral_time) || 0) - (timeToMinutes(b.funeral_time) || 0));

    const exactRule = sortedRules.find(r => r.funeral_time === funeralTimeStr);
    if (exactRule) {
        return {
            minWakeMin: exactRule.is_forbidden ? null : timeToMinutes(exactRule.min_wake_time || null),
            isForbidden: !!exactRule.is_forbidden,
            matchedRule: exactRule
        };
    }

    const blockMin = timeToMinutes(facility.funeral_block_time);
    if (blockMin !== null && fMin >= blockMin) {
        return { minWakeMin: null, isForbidden: true, isByBlockTime: true };
    }

    const intervalMin = (facility.turnover_interval_hours ?? 8) * 60;
    return { minWakeMin: fMin + intervalMin, isForbidden: false };
};

const testMin = timeToMinutes('18:00');
const { minWakeMin, isForbidden } = getTurnoverConstraint(facility, funeralTimeStr);

console.log("Wake limit for 10:00 Funeral:", getTurnoverConstraint(facility, funeralTimeStr));
console.log("isForbidden:", isForbidden);
console.log("testMin(18:00) < minWakeMin:", minWakeMin !== null && testMin < minWakeMin);
