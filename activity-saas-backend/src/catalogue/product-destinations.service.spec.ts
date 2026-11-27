import { ProductDestinationsService } from './product-destinations.service';
import { ProductReferenceController } from './product-reference.controller';
import { UserRole } from '@prisma/client';

describe('destination catalogue configuration',()=>{
  function fixture(value:any=null){const tx:any={globalSetting:{findFirst:jest.fn(async()=>value),create:jest.fn(async({data})=>{value={id:'setting',...data};return value;}),update:jest.fn(async({data})=>{value={...value,...data};return value;})},$executeRaw:jest.fn()};const prisma:any={...tx,$transaction:jest.fn(fn=>fn(tx))};const audit:any={write:jest.fn()};return{tx,audit,service:new ProductDestinationsService(prisma,audit)};}
  it('merges configured locations without losing standard destinations or creating case duplicates',async()=>{
    const s=fixture({value:{destinations:[{country:'India',state:'Kerala',city:'kochi'},{country:'India',state:'Kerala',city:'Athirappilly'}]}});
    const all=await s.service.list();expect(all.filter(row=>row.city.toLowerCase()==='kochi')).toHaveLength(1);expect(all).toContainEqual({country:'India',state:'Kerala',city:'Athirappilly'});
  });
  it('adds idempotently under a transaction lock and writes an audit record',async()=>{
    const s=fixture(),actor={sub:'admin',role:UserRole.ADMIN} as any;
    const first=await s.service.add(actor,{country:'india',state:'kerala',city:' Athirappilly '});expect(first.added).toBe(true);expect(first.destinations).toContainEqual({country:'India',state:'Kerala',city:'Athirappilly'});expect(s.tx.$executeRaw).toHaveBeenCalled();
    expect((await s.service.add(actor,{country:'India',state:'Kerala',city:'Athirappilly'})).added).toBe(false);expect(s.audit.write).toHaveBeenCalledTimes(1);
  });
  it('deduplicates a large configured catalogue while preserving every distinct hierarchy',async()=>{
    const rows=Array.from({length:2500},(_,index)=>({country:'India',state:'Kerala',city:`Demonstration village ${index}`}));
    const s=fixture({value:{destinations:[...rows,...rows.map(row=>({...row,country:'india'}))]}}),all=await s.service.list();
    expect(all.filter(row=>row.city.startsWith('Demonstration village'))).toHaveLength(2500);
  });
  it.each([null,[],{country:'India',state:'Kerala',city:''},{country:'India',state:'Kerala',city:'bad\ncity'}])('rejects malformed settings before writes (%s)',async input=>{const s=fixture();await expect(s.service.add({sub:'admin'} as any,input)).rejects.toThrow();expect(s.tx.globalSetting.create).not.toHaveBeenCalled();});
  it('restricts catalogue mutation to platform administrators with settings permission',()=>{
    const fn=ProductReferenceController.prototype.add;
    expect(Reflect.getMetadata('roles',fn)).toEqual([UserRole.ADMIN,UserRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata('permissions',fn)).toContain('platform.settings.manage');
  });
});
