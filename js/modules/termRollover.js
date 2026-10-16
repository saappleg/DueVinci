const NEXT_SEASON = Object.freeze({ spring: 'Summer', summer: 'Fall', fall: 'Spring', winter: 'Spring' });

export function suggestNextTermName(sourceTerm, existingTerms = []) {
    const source = String(sourceTerm || '').trim();
    const match = source.match(/^(Spring|Summer|Fall|Winter)\s+(\d{4})$/i);
    let suggestion = match
        ? `${NEXT_SEASON[match[1].toLowerCase()]} ${Number(match[2]) + (match[1].toLowerCase() === 'fall' ? 1 : 0)}`
        : `${source || 'New'} - Next Term`;
    const existing = new Set((existingTerms || []).map((term) => String(term || '').trim().toLocaleLowerCase()));
    if (!existing.has(suggestion.toLocaleLowerCase())) return suggestion;
    let suffix = 2;
    while (existing.has(`${suggestion} (${suffix})`.toLocaleLowerCase())) suffix += 1;
    return `${suggestion} (${suffix})`;
}

export function buildTermRolloverCoursePayload(courses = [], userId, targetTerm) {
    const term = String(targetTerm || '').trim();
    if (!userId) throw new Error('Please sign in before rolling over a term.');
    if (!term) throw new Error('Enter a name for the new term.');
    if (term.length > 80) throw new Error('Term names must be 80 characters or fewer.');
    return (courses || []).filter((course) => course?.code).map((course) => ({
        user_id: userId,
        name: course.name || null,
        code: course.code,
        emoji: course.emoji || '📚',
        color: course.color || '#4f46e5',
        term,
        start_date: null,
        end_date: null,
        is_completed: false,
        pacing_type: course.pacing_type || 'manual',
        pacing_source: null,
        lms_provider: null,
        lms_source_id: null,
        rollover_source_course_id: String(course.id),
    }));
}
