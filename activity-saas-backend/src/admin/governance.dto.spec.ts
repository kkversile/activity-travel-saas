import { validate } from 'class-validator';
import { DocumentReviewDto } from './governance.dto';

describe('DocumentReviewDto', () => {
  it('requires a valid document review status', async () => {
    expect((await validate(Object.assign(new DocumentReviewDto(), {}))).length).toBeGreaterThan(0);
  });
});
