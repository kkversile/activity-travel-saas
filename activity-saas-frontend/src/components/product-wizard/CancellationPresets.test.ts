import {expect,it} from 'vitest';
import {cancellationPresetOptions} from './ActivityPricesAvailability';
it('gives each day exactly one cancellation charge for every standard preset',()=>{
  for(const preset of cancellationPresetOptions.filter(p=>p.value!=='CUSTOM')) {
    for(let day=0;day<31;day++) {
      const matches=preset.rules.filter(r=>day>=Number(r.minDaysBefore)&&(r.maxDaysBefore===''||day<=Number(r.maxDaysBefore)));
      expect(matches,`${preset.value}: day ${day}`).toHaveLength(1);
    }
  }
});
