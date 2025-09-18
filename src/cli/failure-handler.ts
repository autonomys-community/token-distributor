import { TransactionFailureHandler, DistributionRecord } from '../types';
import { UserPrompts } from './prompts';

export class InteractiveFailureHandler implements TransactionFailureHandler {
  constructor(private _prompts: UserPrompts) {}

  async handleFailure(
    record: DistributionRecord,
    index: number,
    error: any,
    attempts: number
  ): Promise<'retry' | 'skip' | 'pause' | 'abort'> {
    return await this._prompts.handleTransactionFailure(record, index, error, attempts);
  }
}
