// apps/api/src/ml/ml.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PosthogService } from '../../analytics/posthog.service';

const execAsync = promisify(exec);

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly modelPath: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private posthog: PosthogService,
  ) {
    this.modelPath = this.config.get<string>('ML_MODEL_PATH') ?? 'ml_model.json';
  }

  /** Load the model JSON (dummy placeholder) */
  private async loadModel(): Promise<any> {
    try {
      const data = await this.prisma.$queryRaw<any[]>(`SELECT * FROM "ml_model" LIMIT 1`);
      // In a real implementation we would read a file; here we just return a static object
      return { version: 'dummy', weight: 0.5, bias: 0 };
    } catch (e) {
      this.logger.warn('Model not found in DB, using fallback');
      return { version: 'fallback', weight: 0.5, bias: 0 };
    }
  }

  /** Simple linear predictor as placeholder */
  private predictAbility(model: any, features: number[]): number {
    // features could be aggregated attempt stats – we just sum them * weight + bias
    const sum = features.reduce((a, b) => a + b, 0);
    return model.weight * sum + model.bias;
  }

  /** Public API – returns ability and confidence for a user‑topic */
  async getPrediction(userId: number, topicId: number): Promise<{ ability: number; confidence: number }> {
    const model = await this.loadModel();
    // Pull recent attempts for the user on this topic (placeholder – simple count)
    const attempts = await this.prisma.questionAttempt.findMany({
      where: { userId },
      select: { timeMs: true, isCorrect: true },
    });
    const featureVals = attempts.map((a) => (a.isCorrect ? 1 : 0) * a.timeMs / 1000);
    const ability = this.predictAbility(model, featureVals);
    const confidence = Math.min(1, Math.max(0, ability / 10)); // dummy scaling
    // Persist prediction
    const latestVersion = await this.prisma.modelVersion.findFirst({ orderBy: { createdAt: 'desc' } });
    await this.prisma.mlPrediction.upsert({
      where: { userId_topicId: { userId, topicId } },
      create: {
        userId,
        topicId,
        ability,
        confidence,
        modelVersionId: latestVersion?.id ?? 0,
      },
      update: { ability, confidence, modelVersionId: latestVersion?.id ?? 0 },
    });
    await this.posthog.capture('ml_prediction', 'system', { userId, topicId, ability, confidence });
    return { ability, confidence };
  }

  /** Trigger the Python training script (placeholder) */
  async runTraining(): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('python scripts/train_model.py');
      this.logger.log('Training output:', stdout.trim());
      if (stderr) this.logger.warn('Training stderr:', stderr.trim());
      // After training, we could ingest the new model into DB – omitted for brevity
    } catch (err) {
      this.logger.error('Training script failed', err);
    }
  }
}
