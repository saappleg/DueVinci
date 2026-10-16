import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseClient } from '../js/modules/config.js';
import { exportUserDataJSON } from '../js/modules/backup.js';

describe('backup export failures', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('does not download a backup after a required cloud query fails', async () => {
        const alert = vi.fn();
        vi.stubGlobal('alert', alert);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const select = vi.fn().mockResolvedValue({ data: null, error: new Error('network unavailable') });
        const from = vi.spyOn(supabaseClient, 'from').mockReturnValue({ select });

        await expect(exportUserDataJSON()).resolves.toBeUndefined();

        expect(from).toHaveBeenCalledOnce();
        expect(from).toHaveBeenCalledWith('courses');
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('no file was downloaded'));
    });
});
