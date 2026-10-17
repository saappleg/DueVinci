import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
    new URL('../supabase/migrations/20261017022939_coursework_workflow_fields.sql', import.meta.url),
    'utf8'
).replace(/\s+/g, ' ').toLowerCase();
const gradeabilityMigration = readFileSync(
    new URL('../supabase/migrations/20261017064026_assignment_gradeability.sql', import.meta.url),
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

describe('Assignment gradeability migration', () => {
    it('defaults new coursework to not gradeable and backfills existing graded rows only when adding the column', () => {
        const firstAddition = gradeabilityMigration.match(/if not exists \((.*?)\) then (.*?) end if;/);

        expect(gradeabilityMigration).toContain('from information_schema.columns');
        expect(firstAddition?.[1]).toContain("table_schema = 'public'");
        expect(firstAddition?.[1]).toContain("table_name = 'assignments'");
        expect(firstAddition?.[1]).toContain("column_name = 'is_gradeable'");
        expect(firstAddition?.[2]).toContain(
            'alter table public.assignments add column if not exists is_gradeable boolean not null default false;'
        );
        expect(firstAddition?.[2]).toContain(
            'update public.assignments set is_gradeable = true where grade is not null or grade_category_id is not null;'
        );
        expect(gradeabilityMigration.match(/update public\.assignments set is_gradeable = true/g)).toHaveLength(1);
    });
});
