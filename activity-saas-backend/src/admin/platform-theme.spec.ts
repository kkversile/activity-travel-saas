import { UserRole } from '@prisma/client';
import { validate } from 'class-validator';
import { AdminService } from './admin.service';
import { UpdatePlatformThemeDto } from './governance.dto';
import { normalizePlatformTheme, readPlatformTheme } from '../common/platform-theme';

describe('Global appearance', () => {
  it('returns a safe default and only public theme metadata', async () => {
    expect(normalizePlatformTheme({ theme: 'malicious-css' })).toBe('voya-midnight');
    expect(await readPlatformTheme({ globalSetting: { findFirst: async () => null } })).toEqual({ theme: 'voya-midnight', colors: { page: '#0e131d', surface: '#161d2a', raised: '#1c2433', primary: '#8d9df5', accent: '#f0a040' }, updatedAt: null });
  });
  it('validates the theme allowlist', async () => {
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'revspine-warm' }))).toHaveLength(0);
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'lagoon' }))).toHaveLength(0);
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'canopy' }))).toHaveLength(0);
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'url(evil)' }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'revspine-warm', page: '#fcf9f3', primary: '#8a4a20' }))).toHaveLength(0);
    expect(await validate(Object.assign(new UpdatePlatformThemeDto(), { theme: 'revspine-warm', page: 'url(evil)' }))).not.toHaveLength(0);
  });
  it('prevents a normal admin changing the site theme', async () => {
    const service = new AdminService({} as any, {} as any, {} as any);
    await expect(service.updateAppearance({ role: UserRole.ADMIN } as any, 'revspine-warm')).rejects.toThrow('Only a Super Admin');
  });
  it('updates one global record and audits the previous selection', async () => {
    const write = jest.fn();
    const update = jest.fn().mockResolvedValue({ id: 'theme-id', updatedAt: 'now' });
    const tx = { $queryRaw: jest.fn(), globalSetting: { findFirst: jest.fn().mockResolvedValue({ id: 'theme-id', value: { theme: 'voya-midnight' } }), update } };
    const service = new AdminService({ $transaction: (fn: any) => fn(tx) } as any, { write } as any, {} as any);
    const colors = { page: '#f0e9dd', surface: '#fffaf6', raised: '#f2eadf', primary: '#8a4a20', accent: '#dda04a' };
    expect(await service.updateAppearance({ role: UserRole.SUPER_ADMIN, sub: 'admin-id' } as any, 'revspine-warm', colors)).toEqual({ theme: 'revspine-warm', colors, updatedAt: 'now' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'theme-id' }, data: expect.objectContaining({ value: { theme: 'revspine-warm', colors } }) }));
    expect(write).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'PLATFORM_THEME_UPDATED', beforeState: expect.objectContaining({ theme: 'voya-midnight' }), afterState: { theme: 'revspine-warm', colors } }));
  });
});
