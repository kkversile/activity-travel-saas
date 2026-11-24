import {afterEach,it,expect,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import * as XLSX from 'xlsx';
import App from './App';
import {api} from './api';
import {createSampleWorkbook} from './components/product-import/productImport';

vi.mock('./lazyPages',async original=>({
  ...await original<typeof import('./lazyPages')>(),
  PartnerEditProductPage:({productId}:{productId:string})=><div>Review imported draft {productId}</div>,
}));
afterEach(()=>{vi.restoreAllMocks();api.setToken(null);api.setActiveOutletId(null);window.history.replaceState({},'','/');});

it('opens the imported draft in the actual vendor router while preserving the selected outlet',async()=>{
  window.history.replaceState({},'','/vendor/bulk-upload?outletId=outlet-a');api.setToken('fixture-session');
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.spyOn(api,'request').mockImplementation(async path=>{
    if(path==='/auth/me')return {id:'owner',tenantId:'tenant',role:'VENDOR',organizationRole:'OWNER',email:'owner@fixture.invalid'} as never;
    if(path==='/vendor/outlets')return {access:'ALL',outlets:[{id:'outlet-a',tenantId:'tenant',name:'Fort Kochi',outletCode:'KOCHI',status:'ACTIVE',isDefault:true},{id:'outlet-b',tenantId:'tenant',name:'Alleppey',outletCode:'ALLEPPEY',status:'ACTIVE',isDefault:false}]} as never;
    if(path==='/vendor/profile')return {legalBusinessName:'Harbour Trails',readinessScore:100,verificationStatus:'VERIFIED'} as never;
    if(path==='/vendor/onboarding')return {status:'APPROVED'} as never;
    if(path==='/products/import/batch/validate')return {valid:true} as never;
    if(path==='/products/import/json')return {productId:'saved-product'} as never;
    return {} as never;
  });
  render(<App/>);await screen.findByRole('heading',{name:'Bulk upload'});
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'Current outlet'})).toHaveValue('outlet-a'));
  fireEvent.click(screen.getByRole('button',{name:'Choose file & validate'}));await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Completed Excel, CSV or JSON file'),{target:{files:[new File([XLSX.write(createSampleWorkbook(),{type:'array',bookType:'xlsx'})],'products.xlsx')]}});
  await screen.findByText(/1 parsed product/);fireEvent.click(screen.getByRole('button',{name:'Validate file'}));await screen.findByText(/Server validation passed/);
  fireEvent.click(screen.getByRole('button',{name:'Import valid products (1)'}));
  expect(await screen.findByText('Review imported draft saved-product')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/vendor/products/saved-product/edit');expect(new URLSearchParams(window.location.search).get('outletId')).toBe('outlet-a');expect(api.activeOutletId).toBe('outlet-a');
});
