import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

function registration(overrides: Partial<RegisterDto> = {}) {
  return Object.assign(new RegisterDto(), {
    fullName: 'Vendor Owner',
    businessName: 'Coastal Tours',
    email: 'owner@example.com',
    mobile: '+919876543210',
    category: 'Day tours & sightseeing',
    city: 'Panaji',
    password: 'safePass123',
    acceptedTerms: true,
    ...overrides,
  });
}

describe('RegisterDto', () => {
  it('accepts the prototype password policy and required terms acceptance', async () => {
    await expect(validate(registration())).resolves.toHaveLength(0);
  });

  it('rejects passwords without a number', async () => {
    const errors = await validate(registration({ password: 'safePassword' }));
    expect(errors.find((error) => error.property === 'password')).toBeDefined();
  });

  it('requires the user to accept the partner terms', async () => {
    const falseAcceptance = await validate(registration({ acceptedTerms: false }));
    expect(falseAcceptance.find((error) => error.property === 'acceptedTerms')).toBeDefined();

    const missingAcceptance = registration();
    delete (missingAcceptance as Partial<RegisterDto>).acceptedTerms;
    const missingErrors = await validate(missingAcceptance);
    expect(missingErrors.find((error) => error.property === 'acceptedTerms')).toBeDefined();
  });
});
