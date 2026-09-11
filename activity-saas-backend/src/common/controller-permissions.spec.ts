import 'reflect-metadata';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { CatalogueController } from '../catalogue/catalogue.controller';
import { SchedulesController } from '../schedules/schedules.controller';
import { InventoryController } from '../inventory/inventory.controller';
import { ResourcesController } from '../resources/resources.controller';
import { AdminController } from '../admin/admin.controller';

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
    expect(permissionsOf(CatalogueController, 'reviewQueue')).toContain('product.view');
  });
});
