import { Injectable } from '@nestjs/common';
import { AiProvider, AiProviderResult } from './ai-provider.interface';

@Injectable()
export class MockAiProvider implements AiProvider {
  async generate(input: { system: string; user: string }): Promise<AiProviderResult> {
    const request = JSON.parse(input.user) as { activityName?: string; city?: string; state?: string; country?: string; category?: string };
    const name = request.activityName?.trim() || 'Untitled activity';
    const city = request.city?.trim() || 'Supplier to confirm';
    const state = request.state?.trim() || 'Supplier to confirm';
    const country = request.country?.trim() || 'Supplier to confirm';
    return { model: 'mock', content: {
      Basic_Info: [{ product_key: `AI-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase() || 'ACTIVITY'}`, product_name: name, type: 'ACTIVITY', sub_type: 'Guided activity', sub_category: request.category || 'Activity', city, state, country, meeting_model: null, short_description: `A supplier-led ${name.toLowerCase()} in ${city}.`, meeting_point: null, labels: ['AI suggested'] }],
      Experience: [{ full_description: `Experience ${name.toLowerCase()} with a local supplier in ${city}. The supplier must verify the route, inclusions, restrictions and operating details before publication.`, highlights: ['Local experience', 'Supplier-led activity'], important_information: ['Supplier to confirm meeting instructions and requirements.'], things_to_carry: ['Comfortable clothing', 'Water'], safety_measures: ['Supplier to confirm safety instructions.'], terms: [], how_to_redeem: [], additional_information: [], metaname: name }],
      Options: [{ option_code: 'STANDARD', option_name: 'Standard option', description: `Standard ${name.toLowerCase()} option`, duration_minutes: null, sharing: 'SHARED', vehicle_guide_type: null, pickup_included: false, pickup_type: null, pickup_instructions: null, pickup_timings: null, dropoff_included: false, meal_included: false, inclusions: [], exclusions: [], suitable_for: [] }],
      Rate_Plans: [], Availability: [], Media: [], Booking_Questions: [], Fulfilment: [],
    } };
  }
}
