import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalibrationService } from './calibration.service.js';
import { EvalService } from './eval.service.js';
import { JudgmentCacheService } from './judge/judgment-cache.service.js';
import { LabelingService } from './labeling.service.js';
import { ReportService } from './report.service.js';

@Controller('eval')
export class EvalController {
  private readonly logger = new Logger(EvalController.name);

  constructor(
    private readonly evalService: EvalService,
    private readonly labelingService: LabelingService,
    private readonly calibrationService: CalibrationService,
    private readonly judgeCache: JudgmentCacheService,
    private readonly reportService: ReportService,
  ) {}

  @Get('label')
  async label() {
    const labeled = await this.labelingService.labelAll();
    this.logger.log(`Label check: ${labeled.length} queries labeled`);
    return labeled;
  }

  @Post('run')
  @HttpCode(200)
  async run(@Query('judge') judge?: string) {
    const judgeType: 'local' | 'gemini' =
      judge === 'gemini' ? 'gemini' : 'local';
    this.logger.log(`Starting evaluation run (judge=${judgeType})`);
    const report = await this.evalService.runEvaluation(judgeType);
    this.reportService.store(report);
    this.logger.log(
      `Evaluation complete — precision@${report.top_k}=${report.aggregate.precision_at_k} mrr=${report.aggregate.mrr} judge=${judgeType}`,
    );
    return report;
  }

  @Get('calibrate')
  async calibrate() {
    this.logger.log('Starting calibration run');
    const result = await this.calibrationService.run();
    this.logger.log(
      `Calibration complete — agreement=${(result.agreement_pct * 100).toFixed(1)}%`,
    );
    return result;
  }

  @Get('report')
  report(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(this.reportService.getHtml());
  }

  @Delete('cache')
  @HttpCode(200)
  async clearCache() {
    await this.judgeCache.clear();
    return { message: 'Judgment cache cleared' };
  }
}
