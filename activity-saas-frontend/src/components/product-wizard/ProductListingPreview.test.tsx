import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProductListingPreview from './ProductListingPreview';
import { emptyRevisionForm, type WizardSnapshot } from './types';

const snapshot=():WizardSnapshot=>({product:null,revision:null,variants:[],schedules:[]});
describe('Voya working listing preview',()=>{
  it('uses persisted list formatting and shows an under-review revision as read-only',()=>{
    const current=snapshot();current.revision={status:'UNDER_REVIEW'} as NonNullable<WizardSnapshot['revision']>;
    render(<ProductListingPreview form={{...emptyRevisionForm,highlights:'Waterfront stories, Trading heritage, Local guide'}} snapshot={current} />);
    expect(screen.getByText('In QC · read-only')).toBeInTheDocument();
    expect(screen.queryByText('Working draft')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
  it('reflects unsaved content without representing it as a published or priced listing',()=>{
    const {rerender}=render(<ProductListingPreview form={{...emptyRevisionForm}} snapshot={snapshot()} />);
    expect(screen.getByText('Your experience title')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    rerender(<ProductListingPreview form={{...emptyRevisionForm,productName:'Kochi through local eyes',cityName:'Kochi',stateName:'Kerala',shortDescription:'Walk with the people who call this city home.',highlights:'Spice market\nWaterfront stories\nLocal host\nExtra highlight',durationValue:'1',durationUnit:'HOURS'}} snapshot={snapshot()} />);
    expect(screen.getByRole('heading',{name:'Kochi through local eyes'})).toBeInTheDocument();
    expect(screen.getByText('Kochi, Kerala')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();
    expect(screen.queryByText('Extra highlight')).not.toBeInTheDocument();
    expect(screen.getByText(/This does not publish your listing/)).toBeInTheDocument();
    expect(screen.queryByText(/[₹$][0-9]/)).not.toBeInTheDocument();
  });

  it('uses the saved cover rank, falls back on failure and retries a new saved cover',()=>{
    const current=snapshot();current.revision={media:[{id:'later',kind:'IMAGE',rank:2,externalUrl:'https://example.com/later.jpg'},{id:'cover',kind:'IMAGE',rank:0,fileAssetId:'saved-cover',description:'Our walking tour'}]} as NonNullable<WizardSnapshot['revision']>;
    const {rerender}=render(<ProductListingPreview form={{...emptyRevisionForm}} snapshot={current} />);
    const image=screen.getByRole('img',{name:'Our walking tour'});expect(image).toHaveAttribute('src',expect.stringContaining('/files/public/saved-cover/content'));
    fireEvent.error(image);expect(screen.getByText('Cover preview unavailable')).toBeInTheDocument();
    expect(current.revision!.media).toHaveLength(2);
    current.revision={media:[{id:'new',kind:'IMAGE',rank:0,fileAssetId:'new-cover',description:'Updated cover'}]} as NonNullable<WizardSnapshot['revision']>;
    rerender(<ProductListingPreview form={{...emptyRevisionForm}} snapshot={current} />);
    expect(screen.getByRole('img',{name:'Updated cover'})).toHaveAttribute('src',expect.stringContaining('/files/public/new-cover/content'));
  });

  it('counts only active bookable options and treats entered markup as plain text',()=>{
    const current=snapshot();current.variants=[{id:'a',name:'Shared walk',status:'ACTIVE'},{id:'b',name:'Old private walk',status:'ARCHIVED'}] as never;
    render(<ProductListingPreview form={{...emptyRevisionForm,productName:'<img src=x onerror=alert(1)>',durationUnit:'FLEXIBLE'}} snapshot={current} />);
    expect(screen.getByText('1 bookable option')).toBeInTheDocument();
    expect(screen.getByText('Shared walk')).toBeInTheDocument();
    expect(screen.queryByText('Old private walk')).not.toBeInTheDocument();
    expect(screen.getByText('Flexible duration')).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'<img src=x onerror=alert(1)>'})).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
