import { Controller, Get, Logger, Post } from '@nestjs/common';
import { EvalService } from './eval.service.js';
import { LabelingService } from './labeling.service.js';

@Controller('eval')
export class EvalController {
  private readonly logger = new Logger(EvalController.name);

  constructor(
    private readonly evalService: EvalService,
    private readonly labelingService: LabelingService,
  ) {}

  @Get('label')
  async label() {
    const labeled = await this.labelingService.labelAll();
    this.logger.log(`Label check: ${labeled.length} queries labeled`);
    return labeled;
  }

  @Post('run')
  async run() {
    this.logger.log('Starting evaluation run');
    const report = await this.evalService.runEvaluation();
    this.logger.log(
      `Evaluation complete — recall@${report.top_k}=${report.aggregate.recall_at_k} mrr=${report.aggregate.mrr}`,
    );
    return report;
  }
}
