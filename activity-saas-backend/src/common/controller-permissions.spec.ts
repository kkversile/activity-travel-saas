import 'reflect-metadata';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { CatalogueController } from '../catalogue/catalogue.controller';
import { SchedulesController } from '../schedules/schedules.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { ResourcesController } from '../resources/resources.controller';
import { AdminController } from '../admin/admin.controller';
import { VendorToolsController } from '../vendor-tools/vendor-tools.controller';
import { FinanceController } from '../finance/finance.controller';
import { ROLES_KEY } from './roles.decorator';

const permissionsOf = (controller: any, method: string) => Reflect.getMetadata(PERMISSIONS_KEY, controller.prototype[method]);

describe('sensitive controller permission metadata', () => {
  it('protects all product revision and variant mutations with product.edit', () => {
    for (const method of ['create', 'revision', 'updateRevision', 'submit', 'addMedia', 'uploadMedia', 'archiveMedia', 'createVariant', 'updateVariant', 'archiveVariant']) expect(permissionsOf(CatalogueController, method)).toContain('product.edit');
  });

  it('protects canonical schedule, inventory and resource APIs', () => {
    for (const method of ['list', 'get']) expect(permissionsOf(SchedulesController, method)).toContain('schedule.view');
    for (const method of ['create', 'update', 'activate', 'deactivate', 'archive', 'addSlot', 'map', 'exception', 'materialize']) expect(permissionsOf(SchedulesController, method)).toContain('schedule.edit');
    expect(permissionsOf(InventoryController, 'list')).toContain('inventory.view');
    expect(permissionsOf(InventoryController, 'apply')).toContain('inventory.edit');
    expect(permissionsOf(ResourcesController, 'list')).toContain('resource.view');
    expect(permissionsOf(ResourcesController, 'create')).toContain('resource.edit');
  });

  it('protects admin reads explicitly', () => {
    expect(permissionsOf(AdminController, 'dashboard')).toContain('audit.view');
    expect(permissionsOf(AdminController, 'vendors')).toContain('vendor.profile.view');
    expect(permissionsOf(AdminController, 'vendor')).toEqual(expect.arrayContaining(['vendor.profile.view', 'document.view']));
    expect(permissionsOf(AdminController, 'activityContentSettingsForProductWizard')).toContain('product.view');
    expect(permissionsOf(CatalogueController, 'reviewQueue')).toContain('product.view');
  });

  it('lets normal admins create vendors while limiting platform-admin creation to super admins', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.createVendor)).toEqual(['ADMIN', 'SUPER_ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.createAdmin)).toEqual(['SUPER_ADMIN']);
  });

  it('allows admins to read shared catalogue taxonomy and itinerary details', () => {
    expect(Reflect.getMetadata(ROLES_KEY, VendorToolsController.prototype.listActivityCategories)).toEqual(['VENDOR', 'ADMIN', 'SUPER_ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, CatalogueController.prototype.adminItinerary)).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(permissionsOf(CatalogueController, 'adminItinerary')).toContain('product.view');
    for (const method of ['replaceAdminItinerary', 'saveAdminLocation']) {
      expect(Reflect.getMetadata(ROLES_KEY, (CatalogueController.prototype as any)[method])).toEqual(['SUPER_ADMIN', 'ADMIN']);
      expect(permissionsOf(CatalogueController, method)).toContain('product.edit');
    }
  });

  it('requires separate Admin actions to request and approve payout release evidence', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FinanceController.prototype.recordRelease)).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(permissionsOf(FinanceController, 'recordRelease')).toContain('payout.release.request');
    expect(Reflect.getMetadata(ROLES_KEY, FinanceController.prototype.approveRelease)).toEqual(['SUPER_ADMIN', 'ADMIN']);
    expect(permissionsOf(FinanceController, 'approveRelease')).toContain('payout.release.approve');
    expect(permissionsOf(FinanceController, 'rejectRelease')).toContain('payout.release.approve');
  });

  it('allows normal Admins to request and separately review agent wallet credits', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.creditAgentWallet)).toEqual(['ADMIN', 'SUPER_ADMIN']);
    expect(permissionsOf(AdminController, 'creditAgentWallet')).toContain('agent.governance.edit');
    for (const method of ['approveAgentWalletCredit', 'rejectAgentWalletCredit']) {
      expect(Reflect.getMetadata(ROLES_KEY, (AdminController.prototype as any)[method])).toEqual(['ADMIN', 'SUPER_ADMIN']);
      expect(permissionsOf(AdminController, method)).toContain('agent.governance.edit');
    }
  });

  it('allows Admin maker-checker approval for multi-supplier selection rules', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController.prototype.approveMatchingSelectionRules)).toEqual(['ADMIN', 'SUPER_ADMIN']);
    expect(permissionsOf(AdminController, 'approveMatchingSelectionRules')).toContain('product.publish');
  });
});
