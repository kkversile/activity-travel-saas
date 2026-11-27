import { destinationIssue, durationReadiness, resolveProductDestination, PRODUCT_IMPORT_REQUIRED_FIELDS } from './product-entry-contract';
import { normalizeImportChoices } from './product-import-contract';

describe('shared product entry contract',()=>{
  it('shares import requirements without making optional tags or review-only duration mandatory for drafts',()=>{expect(PRODUCT_IMPORT_REQUIRED_FIELDS.Basic_Info).toContain('product_name');expect(PRODUCT_IMPORT_REQUIRED_FIELDS.Basic_Info).not.toContain('sub_category');expect(PRODUCT_IMPORT_REQUIRED_FIELDS.Basic_Info).not.toContain('duration_unit');});
  it.each([['2','HOURS',null],['0.5','DAYS',null],['','FLEXIBLE',null],['','','DURATION_MISSING'],['0','HOURS','DURATION_VALUE_REQUIRED'],['-1','DAYS','DURATION_VALUE_REQUIRED'],['Infinity','HOURS','DURATION_VALUE_REQUIRED'],['two','HOURS','DURATION_VALUE_REQUIRED'],['2','BANANAS','DURATION_INVALID']])('checks duration %s %s',(value,unit,expected)=>expect(durationReadiness(value,unit)).toBe(expected));
  it('resolves only unambiguous aliases within the full location hierarchy',()=>{
    expect(resolveProductDestination({country:' india ',state:'kerala',city:'Cochin'})).toEqual({country:'India',state:'Kerala',city:'Kochi'});
    expect(resolveProductDestination({country:'UAE',state:'Dubai',city:'Dubai'})).toEqual({country:'United Arab Emirates',state:'Dubai',city:'Dubai'});
    expect(resolveProductDestination({country:'India',state:'Goa',city:'Munnar'})).toBeNull();
    expect(destinationIssue({country:'India',state:'Goa',city:'Munnar'})?.field).toBe('city');
  });
  it('permits incomplete drafts and accepts administrator-added destinations',()=>{
    expect(destinationIssue({country:'India',state:'',city:''})).toBeNull();
    const added={country:'India',state:'Kerala',city:'New village'};
    expect(destinationIssue(added,[added])).toBeNull();
  });
  it('normalizes allowed subtypes and rejects wrong type/subtype combinations in CSV/JSON too',()=>{
    expect(normalizeImportChoices('Basic_Info',{type:'activity',sub_type:'guided tour',duration_unit:'hOur'})).toEqual({row:{type:'ACTIVITY',sub_type:'GUIDED_TOUR',duration_unit:'HOURS'},issues:[]});
    expect(normalizeImportChoices('Basic_Info',{type:'TRANSFER',sub_type:'GUIDED_TOUR'}).issues).toContainEqual(expect.objectContaining({field:'sub_type',correction:expect.stringContaining('AIRPORT_TRANSFER')}));
  });
});
