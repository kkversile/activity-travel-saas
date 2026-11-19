import { csvCell } from './csv';
import { Prisma } from '@prisma/client';

describe('Spreadsheet CSV boundary', () => {
  it.each(['=2+3','+SUM(1,2)','-SUM(1,2)','@SUM(1,2)',' \t=2+3','\u0000=2+3','\ufeff=2+3','\u200b=2+3','\u202e=2+3','＝2+3','＋2+3','－SUM(1,2)','＠SUM(1,2)','\tGuest','\rGuest','\nGuest'])('neutralizes formula/control prefix %j inside a quoted field', input => {
    expect(csvCell(input)).toBe(`"\t${input.replaceAll('"','""')}"`);
    expect(csvCell(input,false)).toBe(csvCell(input));
  });
  it.each(['-100','-100.00','-.50','-1e+3',-100,new Prisma.Decimal('-123.45')])('preserves signed financial value %s', value=>{
    expect(csvCell(value)).toBe(`"${String(value)}"`);
    expect(csvCell(value,false)).toBe(String(value));
  });
  it.each(['00042','09:15','2026-11-20','Guest','മലബാർ',"O'Brien"])( 'preserves ordinary text %s', value=>expect(csvCell(value)).toBe(`"${value}"`));
  it('keeps quotes, separators and embedded rows inside the original cell',()=>{
    expect(csvCell('Guest",=2+3\r\nnext')).toBe('"Guest"",=2+3\r\nnext"');
    expect(csvCell('=2+3",@SUM(1,2)')).toBe('"\t=2+3"",@SUM(1,2)"');
  });
  it('preserves null/zero and optional minimal quoting',()=>{
    expect(csvCell(null)).toBe('""');expect(csvCell(0)).toBe('"0"');
    expect(csvCell(null,false)).toBe('');expect(csvCell('Guest',false)).toBe('Guest');
  });
});
