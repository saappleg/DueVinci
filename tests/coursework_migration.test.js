import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('../supabase/migrations/20261017022939_coursework_workflow_fields.sql', import.meta.url),
    'utf8'
).replace(/\s+/g, ' ').toLowerCase();

describe('Coursework workflow migration', () => {
    it('scopes parent assignments to the same user and clears only the parent link on delete', () => {
        expect(migration).toContain(
            'create unique index if not exists assignments_user_id_id_unique_idx on public.assignments (user_id, id);'
        );
        expect(migration).toContain(
            'foreign key (user_id, parent_assignment_id) references public.assignments (user_id, id) on delete set null (parent_assignment_id);'
        );
        expect(migration).not.toContain(
            'foreign key (parent_assignment_id) references public.assignments (id)'
        );
    });

    it('keeps completion and 100 percent progress in sync for existing and future rows', () => {
        expect(migration).toContain(
            'check ((is_completed is true) = (progress_percent = 100));'
        );
        expect(migration).toContain('set is_completed = false where is_completed is null;');
        expect(migration).toContain('alter column is_completed set not null;');
        expect(migration.match(/elsif new\.progress_percent = 100 then new\.is_completed := true;/g))
            .toHaveLength(2);
        expect(migration).toContain(
            'where (is_completed is true and progress_percent <> 100) or (progress_percent = 100 and is_completed is distinct from true);'
        );
    });
});
